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
│       └── _shared/            # 共享中间件 (鉴权、工具类)
├── 001_platform_schema.sql     # 核心数据库结构
├── 002_initial_seed.sql        # 初始化种子数据
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
  "password": "secret_password"
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
  "channel": "mock"          // 支付渠道: mock, wechat, alipay
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

## 管理后台 (Admin Portal)

位于 `admin-portal/` 目录，提供可视化的多租户管理能力。

*   **应用接入管理**: 自助创建 AppID，查看 Secret。
*   **业务用量报表**: 可视化展示各业务线的 Token 消耗趋势与预估成本。
*   **用户与钱包**: 查看全平台用户状态，人工调整积分/余额。
*   **邀请码管理**: 批量生成注册邀请码。

## 部署说明

1.  **数据库**: 执行 `*.sql` 脚本初始化表结构。
2.  **后端函数**: 使用 `supabase functions deploy <function-name>` 部署。
    *   *注意*: 如果使用 Supabase 网页版编辑器，请务必将 `_shared` 目录下的代码手动合并到入口文件中。
3.  **管理后台**: 进入 `admin-portal` 目录，配置 `.env.local` 后运行 `npm run dev`。
