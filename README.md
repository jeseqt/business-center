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

### 0. 通用数据结构规范

**Metadata (元数据) 传输规范**

为了在管理后台获得更好的展示效果（直接显示中文含义而非英文 Key），建议所有包含 `metadata` 类型字段的接口（如用户注册、用量上报）均采用以下结构传输：

```json
{
  "key": {
    "value": "actual_value",
    "label": "字段中文名"
  }
}
```

**示例**:

```json
"metadata": {
  "career": { "value": "entrepreneur", "label": "职业" },
  "source": { "value": "app_store", "label": "注册来源" },
  "is_vip": { "value": true, "label": "是否会员" }
}
```

若不遵循此格式（仅传输普通键值对），管理后台将直接显示 Key。

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
  "invite_code": "INVITE_123", // (可选) 注册时使用的邀请码
  "metadata": {                // (可选) 用户元数据，建议遵循上述 Metadata 规范
    "career": { "value": "dev", "label": "职业" }
  }
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

### 2. 业务用量上报 (Report Usage)

业务系统（如 AI 对话、语音合成等）在完成一次服务调用后，需调用此接口上报 Token 消耗，以便进行统一计费和审计。

**接口地址**: `POST /functions/v1/report-usage`

**请求头 (Headers)**:
*   `Content-Type`: `application/json`
*   `Authorization`: `Bearer <USER_ACCESS_TOKEN>` (登录接口返回的 access_token)
*   `x-app-id`: `YOUR_APP_KEY`
*   `x-timestamp`: 当前时间戳 (毫秒)
*   `x-sign`: 签名字符串 (详见下文“安全认证机制”)

**请求体 (Body)**:

```json
{
  "model_name": "qwen-plus",    // 模型标识
  "method_name": "guided-reflection-chat", // 方法名 (建议遵循下方规范)
  "method_label": "漫漫引导复盘", // 中文解释，将在报表中显示
  "prompt_tokens": 150,         // 输入 Token 数
  "completion_tokens": 80,      // 输出 Token 数
  "request_metadata": {         // (可选) 额外的业务元数据
    "session_id": "sess_001",
    "mode": "creative"
  }
}
```

**漫反射业务推荐方法名规范**:

| 方法名 (`method_name`) | 中文名称 (`method_label`) | 适用场景 |
| :--- | :--- | :--- |
| `generate-daily-report` | 每日复盘报告 | 生成每日总结 |
| `generate-monthly-report` | 月度自传 | 生成月度回顾 |
| `guided-reflection-chat` | 漫漫引导复盘 | 引导式对话 |
| `guided-goal-chat` | 漫漫目标引导 | 目标设定对话 |
| `enhance-reflection` | 反思内容增强 | 润色用户输入 |
| `generate-action-suggestions` | AI行动建议 | 生成后续行动 |
| `summarize-reflection` | 反思总结 | 总结单次反思 |
| `classify-reflection` | 反思分类 | 自动打标签 |
| `generate-reminder` | 智能提醒 | 生成回顾提醒 |
| `generate-periodic-report` | 周期报告 | 周报/旬报 |
| `polish-journal` | 日记润色 | 优化日记内容 |
| `regenerate-single-action` | 重生成行动 | 重新生成建议 |
| `generate-summary` | 生成总结 | 通用总结 |
| `generate-embedding` | 向量生成 | 文本向量化 |
| `transcribe-audio` | 语音转文字 | ASR 识别 |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": "usage_uuid...",
    "cost_usd": 0.0025, // 本次调用计算后的成本
    ...
  }
}
```

### 3. 安全认证机制 (Security & Signature)

为了保证数据安全，部分敏感接口（如用量上报、钱包查询）需要进行请求签名。

**签名算法**: `HMAC-SHA256( body_string + timestamp, app_secret )`

1.  将 HTTP Request Body (JSON String) 与当前时间戳 (毫秒字符串) 拼接。
2.  使用 `App Secret` (从管理后台获取) 作为密钥，计算 HMAC-SHA256 哈希值。
3.  将哈希值转换为 Hex 字符串作为签名。

**必需 Headers**:
*   `x-app-id`: 应用 Key
*   `x-timestamp`: 当前时间戳 (毫秒)
*   `x-sign`: 计算出的签名 (Hex String)

**需要签名的接口**:
*   `POST /functions/v1/report-usage`
*   `POST /functions/v1/client-wallet`
*   `POST /functions/v1/api-verify-invite` (Server-to-Server)

**不需要签名的接口 (公开)**:
*   `POST /functions/v1/client-auth` (登录/注册)
*   `POST /functions/v1/create-payment` (依赖 User Token)
*   `GET /functions/v1/fetch-config`

### 4. 独立验证邀请码 (Verify Invite)

如果业务流程需要先验证邀请码有效性再进行注册，可以使用此接口。通常情况直接使用 `client-auth` 注册即可。

**接口地址**: `POST /functions/v1/api-verify-invite`

**请求体 (Body)**:

```json
{
  "app_id": "YOUR_APP_KEY",
  "code": "INVITE_123",
  "external_user_id": "uid_123" // 需先确保用户已存在于平台，否则请直接走注册流程
}
```

### 5. 统一支付 (Create Payment)

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

### 6. 统一配置中心 (Fetch Config)

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
    "enable_voice_input": true,
    "enable_ai_mentor": true,
    "maintenance_mode": false,
    "welcome_message": "欢迎来到漫反射，开启你的成长之旅",
    "announcement": {
      "enabled": false,
      "title": "",
      "content": "",
      "type": "info"
    },
    "points_config": {
      "points_per_reflection": 10,
      "points_per_daily_checkin": 5
    },
    "ai_models": {
      "default_chat_model": "qwen-plus",
      "default_report_model": "qwen-max"
    }
  }
}
```

### 7. 版本检查 (Check Version)

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

### 8. 通知中心 (Fetch Notifications)

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

### 9. 工单反馈 (Submit Ticket)

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

### 10. 用户钱包 (Client Wallet)

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

### 11. 邀请码系统 (Invite System)

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
