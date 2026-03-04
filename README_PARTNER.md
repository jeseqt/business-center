# 业务中台 (Business Center) 接入指南

> **版本**: 1.0.0  
> **更新日期**: 2026-03-04  
> **适用对象**: 第三方 App 开发者、合作伙伴

---

## 1. 项目背景与定位

业务中台（Business Center）旨在为旗下所有 AI 应用提供统一的基础设施服务。通过接入中台，App 开发者无需重复造轮子，即可获得以下核心能力：

*   **统一账户体系**：基于 Supabase Auth 的用户管理，支持邮箱、社交登录，并自动关联业务画像。
*   **统一支付与钱包**：内置多渠道支付（BagelPay/微信/支付宝/Stripe）、虚拟货币（Points/Credits）管理、充值与消费流水。
*   **用量计费中心**：Token 级别的消耗统计与成本核算，支持按量付费模型。
*   **运营增长工具**：邀请裂变（一级/二级分销）、版本更新检测、全站公告/通知系统。
*   **客户服务**：统一的工单提交与反馈通道。

## 2. 接入前准备

### 2.1 账号与权限
1.  **申请 App ID**: 联系中台管理员申请 `App ID` (UUID) 和 `App Secret`。
2.  **保存密钥**: `App Secret` 仅在创建时显示一次，请妥善保管。用于接口签名。
3.  **配置回调**: 提供您的服务端 Webhook URL，用于接收充值成功、退款等异步通知。

### 2.2 环境信息
| 环境 | Base URL (API) | 描述 |
| :--- | :--- | :--- |
| **沙箱 (Dev)** | `https://your-project-ref.supabase.co/functions/v1` | 用于开发调试，支付使用 Mock 模式 |
| **生产 (Prod)** | `https://api.your-domain.com/functions/v1` | 正式环境，真实扣费 |

### 2.3 SDK 依赖
项目深度集成 Supabase，推荐直接使用 Supabase 官方客户端。

**JavaScript / TypeScript / React / Vue**
```bash
npm install @supabase/supabase-js
```

**iOS (Swift)**
```swift
// Package.swift
.package(url: "https://github.com/supabase/supabase-swift.git", from: "2.0.0")
```

**Android (Kotlin)**
```kotlin
implementation "io.github.jan-tennert.supabase:postgrest-kt:2.0.0"
implementation "io.github.jan-tennert.supabase:auth-kt:2.0.0"
```

---

## 3. 快速开始 (Quick Start)

以下示例演示如何初始化客户端并调用一个简单的接口。

### 3.1 初始化
在您的应用启动时初始化 Supabase 客户端。

```typescript
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://your-project-ref.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' // 公开的 Anon Key

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: {
    headers: {
      'x-app-id': 'YOUR_APP_ID_UUID' // 必须：标识您的应用
    }
  }
})
```

### 3.2 用户注册与登录
中台复用 Supabase Auth。

```typescript
// 1. 注册 (将会触发中台自动创建钱包和用户档案)
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secure-password',
  options: {
    data: {
      // 可选：透传邀请码
      invite_code: 'ABC1234' 
    }
  }
})

// 2. 登录
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'secure-password'
})

// 登录成功后，supabase 客户端会自动管理 Access Token
```

---

## 4. 全量接口清单 (API Reference)

所有接口均位于 `Supabase Edge Functions`，通过 `supabase.functions.invoke('function-name')` 调用。

**通用请求头**:
*   `Authorization`: `Bearer <User_Access_Token>` (由 SDK 自动处理)
*   `x-app-id`: `<App_ID>` (必须)
*   `x-sign`: `<Signature>` (可选，用于敏感操作，见第 5 节)
*   `x-timestamp`: `<Timestamp>` (可选，配合签名)

### 4.1 核心业务

#### 用户注册初始化 (`client-auth`)
虽然 `supabase.auth.signUp` 处理了基础认证，但如果需要原子化地校验邀请码并创建业务账户，可调用此接口。

*   **Method**: `POST`
*   **Body**:
    ```json
    {
      "action": "register",
      "email": "user@email.com",
      "password": "password123",
      "invite_code": "OPTIONAL_CODE",
      "account": "optional_username"
    }
    ```
*   **Response**: 成功返回用户信息，失败抛出错误。

#### 获取钱包余额 (`client-wallet`)
*   **Method**: `GET`
*   **Response**:
    ```json
    {
      "success": true,
      "data": {
        "id": "wallet_uuid",
        "balance": 100, // 当前余额
        "currency": "CNY",
        "updated_at": "2024-01-01T12:00:00Z"
      }
    }
    ```

#### 获取交易记录 (`client-wallet`)
*   **Method**: `POST`
*   **Body**:
    ```json
    {
      "page": 1,
      "limit": 20
    }
    ```
*   **Response**:
    ```json
    {
      "success": true,
      "data": [
        {
          "id": "tx_uuid",
          "amount": 50,
          "type": "deposit", // deposit, expense, refund
          "description": "Recharge",
          "created_at": "..."
        }
      ],
      "meta": { "total": 100 }
    }
    ```

#### 发起充值 (`create-recharge-order`)
*   **Method**: `POST`
*   **Body**:
    ```json
    {
      "amount": 10.00, // 金额 (美元)
      "product_id": "optional_product_uuid", // 优先使用 product_id
      "app_id": "your_app_id",
      "return_url": "https://yourapp.com/payment/success"
    }
    ```
*   **Response**:
    ```json
    {
      "checkout_url": "https://bagelpay.com/checkout/..." // 前端直接跳转此 URL
    }
    ```
*   **Note**: 在沙箱环境，会自动模拟支付成功并回调。

#### 用量上报 (`report-usage`)
App 在每次 AI 生成结束后调用，用于扣费和统计。

*   **Method**: `POST`
*   **Body**:
    ```json
    {
      "model_name": "gpt-4",
      "prompt_tokens": 100,
      "completion_tokens": 200,
      "request_metadata": { "session_id": "..." }
    }
    ```
*   **Response**: 
    ```json
    { "success": true, "data": { "cost_usd": 0.004, ... } }
    ```

### 4.2 辅助功能

#### 版本检查 (`check-version`)
*   **Method**: `GET`
*   **Query**: `?platform=ios&version_code=100`
*   **Response**:
    ```json
    {
      "success": true,
      "data": {
        "has_update": true,
        "force_update": false,
        "latest_version": "1.0.1",
        "download_url": "...",
        "changelog": "Fix bugs"
      }
    }
    ```

#### 提交工单 (`submit-ticket`)
*   **Method**: `POST`
*   **Body**:
    ```json
    {
      "title": "Bug Report",
      "description": "App crashed when...",
      "contact_email": "user@email.com",
      "category": "bug",
      "priority": "normal"
    }
    ```

#### 获取邀请码 (`get-invite-code`)
*   **Method**: `GET`
*   **Response**:
    ```json
    {
      "code": "A1B2C3", // 当前用户的邀请码
      "redeemed_code": "X9Y8Z7" // 当前用户使用的别人的邀请码（如有）
    }
    ```

---

## 5. 鉴权与安全 (Authentication)

### 5.1 基础鉴权
所有请求必须携带 `x-app-id` 头。涉及用户数据的请求必须携带 Supabase Auth 的 `Authorization: Bearer <JWT>`。

### 5.2 接口签名 (Advanced)
对于高敏感操作（如服务端代调用），建议开启签名验证。

**签名算法**:
1.  构造 Payload: `body_string + timestamp_string`
2.  计算签名: `HMAC-SHA256(Payload, App_Secret)`
3.  添加请求头:
    *   `x-timestamp`: 当前 Unix 时间戳 (毫秒)
    *   `x-sign`: 计算出的 Hex 字符串

**Node.js 示例**:
```javascript
const crypto = require('crypto');

function signRequest(body, secret) {
  const timestamp = Date.now().toString();
  const payload = JSON.stringify(body) + timestamp;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return { timestamp, signature };
}
```

---

## 6. 事件与 Webhook

中台会将关键业务事件推送到 App 配置的 Webhook URL。

**Retry Policy**: 指数退避重试 (1s, 5s, 30s, 1m, 5m)，最多 5 次。

### 6.1 充值成功事件
```json
{
  "event": "payment.success",
  "data": {
    "merchant_order_no": "MO12345678",
    "platform_order_no": "PO87654321",
    "amount": 1000, // 分
    "currency": "USD",
    "status": "paid",
    "metadata": { ... }
  },
  "timestamp": 1678900000
}
```

---

## 7. 错误码对照表

| HTTP Code | Error Message (Partial) | 含义 | 处理建议 |
| :--- | :--- | :--- | :--- |
| 400 | `Missing x-app-id` | 缺少应用标识 | 检查 Header 配置 |
| 401 | `Invalid user token` | Token 无效或过期 | 引导用户重新登录 |
| 403 | `App is not active` | 应用被封禁 | 联系管理员 |
| 404 | `User not registered` | 用户未在业务表中初始化 | 调用 `client-auth` 补全信息或检查注册流程 |
| 429 | `Too Many Requests` | 触发限流 | 稍后重试 |
| 500 | `Database error` | 内部错误 | 携带 Request ID 联系技术支持 |

---

## 8. 技术支持

*   **SLA**: 核心 API 可用性 99.9%
*   **反馈渠道**: 请通过 Admin Portal 提交工单或发送邮件至 `support@business-center.com`
*   **紧急联系**: TG群 `@BusinessCenterSupport`

