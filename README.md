# 业务中台 (Business Center)

本目录包含了业务中台的核心架构、数据库脚本、后端函数及管理后台。

## 目录结构

```
business-center/
├── admin-portal/               # [前端] 中台管理后台 (React + Vite)
├── supabase/
│   └── functions/
│       ├── admin-app-manage/   # [Admin API] 应用管理 (创建应用/生成密钥)
│       ├── client-auth/        # [Client API] 统一客户端认证 (注册/登录)
│       ├── create-payment/     # [Client API] 统一支付下单接口
│       ├── report-usage/       # [Client API] 业务用量上报
│       ├── fetch-config/       # [Client API] 获取动态配置
│       ├── check-version/      # [Client API] 检查新版本
│       ├── fetch-notifications/# [Client API] 获取通知列表
│       ├── submit-ticket/      # [Client API] 提交工单反馈
│       └── _shared/            # 共享中间件 (鉴权、工具类)
├── database/                   # 数据库脚本
│   ├── 001_platform_schema.sql     # 核心数据库结构
│   ├── 002_initial_seed.sql        # 初始化种子数据
│   ├── 004_config_center.sql       # 配置中心表结构
│   ├── 005_version_control.sql     # 版本管理表结构
│   ├── 006_notification_center.sql # 通知中心表结构
│   └── 007_ticket_system.sql       # 工单系统表结构
└── README.md                   # 说明文档
```

## 核心能力与接入指南

### 1. 客户端认证 (Client Auth)

所有接入中台的应用 (APP) 均通过此接口进行用户体系的统一管理。

**接口地址**: `POST /functions/v1/client-auth`

**请求头 (Headers)**:
*   `Content-Type`: `application/json`
*   `x-app-id`: `YOUR_APP_KEY` (从管理后台获取)

**请求体 (Body)**:

```json
{
  "action": "login",  // 或 "register"
  "email": "user@example.com",
  "password": "secret_password",
  "invite_code": "INVITE_123" // (可选) 注册时使用的邀请码
}
```

**前端调用示例 (JS)**:

```javascript
const APP_ID = 'app_xxxxxx'; // 您的 App Key
const API_URL = 'https://<PROJECT_REF>.supabase.co/functions/v1/client-auth';

async function auth(action, email, password) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-id': APP_ID
    },
    body: JSON.stringify({ action, email, password })
  });
  return await res.json();
}

// 登录
auth('login', 'test@test.com', '123456').then(console.log);
```

### 2. 统一支付 (Create Payment)

为所有 APP 提供统一的收银台能力。

**接口地址**: `POST /functions/v1/create-payment`

**请求头 (Headers)**:
*   `Authorization`: `Bearer <USER_ACCESS_TOKEN>` (登录后获取的 Token)
*   `x-app-id`: `YOUR_APP_KEY`

**请求体 (Body)**:

```json
{
  "amount": 100,             // 金额 (单位: 分)
  "product_info": {          // 商品信息快照
    "name": "VIP Membership",
    "sku": "vip_monthly"
  },
  "channel": "mock"          // 支付渠道: mock, wallet, wechat, alipay
}
```

### 3. 业务用量上报 (Report Usage)

用于 APP 上报用户的 AI 模型调用消耗 (Token) 或其他业务用量，便于平台进行统一计费与审计。

**接口地址**: `POST /functions/v1/report-usage`

**请求头 (Headers)**:
*   `Authorization`: `Bearer <USER_ACCESS_TOKEN>`
*   `x-app-id`: `YOUR_APP_KEY`

**请求体 (Body)**:

```json
{
  "model_name": "gpt-4",    // 模型标识
  "prompt_tokens": 150,     // 提问消耗
  "completion_tokens": 80,  // 回答消耗
  "request_metadata": {     // 业务透传字段
    "conversation_id": "conv_123"
  }
}
```

### 4. 统一配置中心 (Fetch Config)

用于获取 App 的动态配置，支持功能开关、UI 文案更新等，无需发版。

**接口地址**: `GET /functions/v1/fetch-config`

**请求参数 (Query)**:
*   `keys`: (可选) 逗号分隔的 key 列表，如 `welcome_msg,show_banner`。不传则返回所有。
*   `env`: (可选) 环境，默认为 `production`。

**请求头 (Headers)**:
*   `x-app-id`: `YOUR_APP_KEY`

**响应示例**:

```json
{
  "success": true,
  "data": {
    "welcome_msg": "Happy New Year!",
    "enable_new_feature": true,
    "theme_color": { "primary": "#FF0000" }
  }
}
```

### 5. 版本检查 (Check Version)

检测 App 是否有新版本，支持强制更新逻辑。

**接口地址**: `GET /functions/v1/check-version`

**请求参数 (Query)**:
*   `platform`: `ios` | `android` | `web` | `macos` | `windows` (必填)
*   `version_code`: 当前版本号 (整数), 如 `100`。

**请求头 (Headers)**:
*   `x-app-id`: `YOUR_APP_KEY`

**响应示例**:

```json
{
  "success": true,
  "data": {
    "has_update": true,
    "latest": {
      "version_name": "1.2.0",
      "version_code": 102,
      "update_content": "修复已知 Bug，优化体验。",
      "download_url": "https://example.com/app.apk",
      "is_force_update": true
    }
  }
}
```

### 6. 通知中心 (Fetch Notifications)

获取 App 的系统公告、活动消息等。

**接口地址**: `GET /functions/v1/fetch-notifications`

**请求头 (Headers)**:
*   `x-app-id`: `YOUR_APP_KEY`

**响应示例**:

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "系统维护通知",
      "content": "我们将于今晚进行维护...",
      "type": "maintenance",
      "priority": "high",
      "start_time": "2023-10-01T00:00:00Z"
    }
  ],
  "meta": {
    "count": 1
  }
}
```

### 7. 工单反馈 (Submit Ticket)

允许 App 用户或游客提交问题反馈、Bug 报告。

**接口地址**: `POST /functions/v1/submit-ticket`

**请求头 (Headers)**:
*   `x-app-id`: `YOUR_APP_KEY`
*   `Content-Type`: `application/json`

**请求体 (Body)**:

```json
{
  "title": "无法登录",
  "description": "点击登录按钮无反应...",
  "contact_email": "user@example.com", // (可选)
  "category": "bug",                   // (可选) bug, feature, billing, other
  "priority": "high",                  // (可选) high, normal, low
  "external_user_id": "uid_123"        // (可选) 业务方用户ID
}
```

**接口地址**: `GET /functions/v1/submit-ticket` (查看工单列表)

**请求参数 (Query)**:
*   `external_user_id`: 筛选特定用户的工单。

### 8. 用户钱包 (Client Wallet)

统一的积分/余额系统，支持跨应用消费。

**接口地址**: `GET /functions/v1/client-wallet` (查询余额)

**请求头 (Headers)**:
*   `Authorization`: `Bearer <USER_ACCESS_TOKEN>`
*   `x-app-id`: `YOUR_APP_KEY`

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": "wallet_uuid",
    "balance": 1000,      // 单位: 分
    "currency": "CNY",
    "updated_at": "2023-10-01T12:00:00Z"
  }
}
```

**接口地址**: `POST /functions/v1/client-wallet` (查询交易明细)

**请求体 (Body)**:

```json
{
  "page": 1,
  "limit": 20
}
```

### 9. 邀请码系统 (Invite System)

用于控制应用注册权限，支持 App 维度的邀请码隔离。

**核心流程**:
1.  **管理员生成**: 在管理后台 "邀请码管理" 中批量生成指定 App 的邀请码。
2.  **用户注册**: 用户在注册时填写邀请码。
3.  **自动核销**: `client-auth` 接口会自动校验邀请码的有效性（所属 App、有效期、剩余次数），校验通过后自动扣减次数并允许注册。

**客户端接入**:
*   无需额外调用独立接口，只需在 `client-auth` 注册接口的 body 中携带 `invite_code` 字段即可。
*   详见 [1. 客户端认证](#1-客户端认证-client-auth)。

## 管理后台 (Admin Portal)

位于 `admin-portal/` 目录，提供可视化的多租户管理能力。

*   **应用接入管理**: 自助创建 AppID，查看 Secret。
*   **统一配置中心**: 动态管理功能开关、文案配置，支持多环境 (Dev/Prod)。
*   **版本发布管理**: 发布新版本，管理强制更新策略，支持多平台 (iOS/Android/Web)。
*   **通知中心**: 发布系统公告、活动通知，支持按优先级排序和有效期管理。
*   **工单系统**: 查看并回复用户提交的反馈工单，支持状态流转。
*   **业务用量报表**: 可视化展示各业务线的 Token 消耗趋势与预估成本。
*   **用户与钱包**: 查看全平台用户状态，人工调整积分/余额。
*   **邀请码管理**: 批量生成注册邀请码。

## 部署说明

1.  **数据库**: 执行 `database/*.sql` 脚本初始化表结构。
2.  **后端函数**: 使用 `supabase functions deploy <function-name>` 部署。
    *   *注意*: 如果使用 Supabase 网页版编辑器，请务必将 `_shared` 目录下的代码手动合并到入口文件中。
3.  **管理后台**: 进入 `admin-portal` 目录，配置 `.env.local` 后运行 `npm run dev`。
