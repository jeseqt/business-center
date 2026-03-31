# 业务中台 (Business Center) 接入文档

本文档为 Business Center 的完整对接指南，旨在帮助第三方客户端（App/Web）快速接入用户体系、钱包支付、运营工具及 AI 计费能力。

---

## 1. 接入准备 (Getting Started)

在开始对接前，请联系管理员在 **Admin Portal** 创建应用，并获取以下关键信息：

*   **App ID (UUID)**: 应用的唯一标识，接口参数中常标记为 `app_id`。
*   **App Key**: 用于接口鉴权的公开密钥，Header 中使用 `x-app-id`。
*   **App Secret**: 用于接口签名的私钥，**请勿在客户端明文存储**（建议通过混淆或云端代理使用）。

---

## 2. 鉴权与安全 (Authentication & Security)

所有接口调用均需遵循以下安全规范。

### 2.1 基础请求头 (Common Headers)

所有 API 请求必须包含：

```http
Content-Type: application/json
x-app-id: <YOUR_APP_KEY>
```

### 2.2 用户鉴权 (User Authentication)

涉及用户个人数据的接口（如钱包、修改资料），需在 Header 中携带登录后获取的 `access_token`：

```http
Authorization: Bearer <ACCESS_TOKEN>
```

### 2.3 接口签名 (Request Signature)

为了防止恶意刷量和篡改，部分敏感接口（标记为 **[Requires Signature]**）需要进行请求签名。

**涉及接口**:
*   `report-usage` (AI 用量上报)
*   `client-wallet` (钱包查询)
*   `sso-login` (单点登录，注：其签名算法略有不同，详情见接口说明)

**签名算法**:

1.  **构造签名串 (String to Sign)**:
    ```
    stringToSign = x-app-id + x-timestamp + JSON.stringify(body)
    ```
    *   `x-app-id`: 您的 App Key
    *   `x-timestamp`: 当前时间戳（毫秒）
    *   `body`: 请求体 JSON 字符串（若无 Body 则为空字符串）

2.  **计算 HMAC-SHA256**:
    使用 `App Secret` 作为密钥，对 `stringToSign` 进行 HMAC-SHA256 计算。

3.  **生成 Hex 字符串**:
    将计算结果转换为十六进制字符串 (Hex Digest)。

**请求示例**:

```http
POST /functions/v1/report-usage
x-app-id: app_key_123
x-timestamp: 1709876543210
x-sign: a1b2c3d4... (Hex Signature)
```

---

## 3. API 详解 (API Reference)

**Base URL**: `https://<YOUR_SUPABASE_PROJECT>.functions.supabase.co`

### 3.1 用户身份 (User Identity)

#### 3.1.1 注册/登录 (Unified Auth)
`POST /functions/v1/client-auth`

集成了 Supabase Auth 注册/登录与业务用户表 (`platform_users`) 的自动同步。

**Request Body**:

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `action` | string | 是 | `register` (注册) 或 `login` (登录) |
| `email` | string | 是 | 用户邮箱 |
| `password` | string | 是 | 密码 (min 6 chars) |
| `invite_code` | string | 否 | 邀请码 (注册时可选，若 App 强制邀请则必填) |
| `account` | string | 否 | 自定义账号名 (注册时可选；跨应用首次登录时也会作为初始化账号名) |
| `app_user_id` | string | 否 | 第三方 App 自身的本地用户 ID。传入后会与中台账号进行绑定映射，后续可通过该 ID 查询用户信息 |

**Response (Success)**:
```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid...", "email": "..." },
    "session": { "access_token": "jwt...", "refresh_token": "..." }
  },
  "app_context": { "app_id": "uuid..." }
}
```

#### 3.1.2 单点登录 (SSO Login) **[Requires Signature]**
`POST /functions/v1/sso-login`

支持第三方系统通过服务端签名的 Token 自动登录或注册用户，并生成免密登录的 Magic Link。老用户首次跨应用使用 SSO 登录时，会自动同步至新应用的业务用户表。

**Request Body**:

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `sso_token` | string | 是 | Base64 编码的 JSON 字符串。JSON 需包含 `app_id` (UUID), `email` (邮箱), 以及可选的 `account` (账号名), `app_user_id` (App 自有用户 ID) |
| `timestamp` | string | 是 | 当前时间戳（毫秒） |
| `sso_sign` | string | 是 | 对 `sso_token + timestamp` 字符串使用 `App Secret` 计算的 HMAC-SHA256 签名 (Hex) |
| `redirectTo` | string | 否 | 登录成功后的回调跳转地址 |

**Response (Success)**:
```json
{
  "action_link": "https://<PROJECT>.supabase.co/auth/v1/verify?token=...&redirect_to=...",
  "user_id": "uuid...",
  "email": "user@example.com"
}
```

---

### 3.2 钱包与财务 (Wallet & Finance)

#### 3.2.1 查询钱包余额 **[Requires Signature]**
`GET /functions/v1/client-wallet`

**Headers**: `Authorization`

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "wallet_uuid",
    "balance": 1000,       // 余额 (单位: 分/Cents 或根据 currency 定义)
    "currency": "CNY",
    "updated_at": "2024-01-01T12:00:00Z"
  }
}
```

#### 3.2.2 查询交易流水 **[Requires Signature]**
`POST /functions/v1/client-wallet`

**Headers**: `Authorization`

**Body**:
```json
{
  "page": 1,
  "limit": 20
}
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "tx_uuid",
      "amount": -100,
      "type": "payment", // payment, recharge, refund, bonus
      "description": "购买会员",
      "created_at": "..."
    }
  ],
  "meta": { "total": 50 }
}
```

#### 3.2.3 创建充值订单 (Recharge)
`POST /functions/v1/create-recharge-order`

创建 BagelPay 充值订单。

**Headers**: `Authorization`

**Body**:
```json
{
  "amount": 10.00,        // 充值金额 (USD)
  "app_id": "uuid...",    // App ID
  "return_url": "https://myapp.com/wallet", // 支付成功回调页
  "product_id": "prod_x"  // (可选) 指定充值商品ID
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "pay_url": "https://bagelpay.com/checkout/..." // 跳转此链接进行支付
  }
}
```

#### 3.2.4 创建消费订单 (Payment)
`POST /functions/v1/create-payment`

使用钱包余额支付商品或服务。

**Headers**: `Authorization`

**Body**:
```json
{
  "amount": 100,           // 金额 (单位: 分)
  "channel": "wallet",     // 支付渠道: "wallet" | "mock"
  "product_info": {
    "name": "VIP Month"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "order_id": "uuid...",
    "status": "paid",
    "payment": {
      "success": true,
      "new_balance": 900
    }
  }
}
```

---

### 3.3 增长与营销 (Growth)

#### 3.3.1 获取我的邀请码
`GET /functions/v1/get-invite-code`

**Headers**: `Authorization`

**Response**:
```json
{
  "code": "ABC1234",          // 我的邀请码
  "redeemed_code": "XYZ987"   // 我使用的邀请码 (若无则 null)
}
```

#### 3.3.2 兑换邀请码
`POST /functions/v1/redeem-invite`

**Headers**: `Authorization`

**Body**:
```json
{
  "code": "XYZ987",
  "app_id": "uuid..."
}
```

**Response**:
```json
{
  "success": true,
  "message": "Redeemed successfully"
}
```

---

### 3.4 运营支持 (Operations)

#### 3.4.1 AI 用量上报 **[Requires Signature]**
`POST /functions/v1/report-usage`

**Headers**: `Authorization`

**Body**:
```json
{
  "model_name": "qwen-plus",    // 模型标识
  "prompt_tokens": 150,
  "completion_tokens": 80,
  "request_metadata": { "session_id": "..." }
}
```

#### 3.4.2 获取通知公告
`GET /functions/v1/fetch-notifications`

**Headers**: `x-app-id` (无需 Auth)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "系统维护通知",
      "content": "我们将于今晚进行维护...",
      "priority": "high", // high, normal, low
      "start_time": "..."
    }
  ]
}
```

#### 3.4.3 提交工单反馈
`POST /functions/v1/submit-ticket`

**Headers**: `x-app-id`

**Body**:
```json
{
  "title": "无法充值",
  "description": "点击充值按钮无反应",
  "contact_email": "user@example.com",
  "category": "bug",      // bug, feature, other
  "priority": "high",
  "external_user_id": "uuid..." // 可选
}
```

---

### 3.5 基础工具 (Utilities)

#### 3.5.1 获取动态配置
`GET /functions/v1/fetch-config?keys=key1,key2&env=production`

#### 3.5.2 检查版本更新
`GET /functions/v1/check-version?platform=ios&version_code=100`

---

## 4. 附录 (Appendix)

### 4.1 常见错误码

| HTTP Status | Error Message | 说明 |
| :--- | :--- | :--- |
| 400 | `Missing x-app-id header` | 请求头缺少 App Key |
| 400 | `Invalid signature` | 签名验证失败，请检查 Secret 或时间戳 |
| 401 | `Invalid user token` | Token 过期或无效 |
| 402 | `Insufficient balance` | 余额不足 (支付时) |
| 404 | `User not registered...` | 用户未在当前 App 上下文中注册 |

### 4.2 交易类型枚举 (Transaction Types)

*   `recharge`: 充值入账
*   `payment`: 消费支出
*   `refund`: 退款
*   `bonus`: 活动赠送
*   `system`: 系统调整
