# 业务中台 (Business Center)

本目录包含了业务中台的核心架构、数据库脚本、后端函数及管理后台。

## 目录结构

```
business-center/
├── admin-portal/               # [前端] 中台管理后台 (React + Vite)
├── supabase/
│   └── functions/
│       ├── admin-app-manage/   # [Admin API] 应用管理 (创建应用/生成密钥)
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

为了在管理后台获得更好的展示效果（直接显示中文含义而非英文 Key），建议所有包含 `metadata` 类型字段的接口（如用量上报）均采用以下结构传输：

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

### 1. 用户认证集成 (User Authentication)

业务中台采用 **Supabase Auth** 作为统一认证中心。各客户端 App 应直接使用 Supabase SDK (或 REST API) 进行注册和登录。

**核心机制：**
*   **统一账号**：用户在中台注册的账号，可在所有接入 App 中通用。
*   **自动关联**：注册时必须提供 App 标识，系统会自动创建业务档案并关联。
*   **ID 一致性**：新注册用户的业务 ID (`platform_user_id`) 与认证 ID (`auth_user_id`) 通常一致 (1:1)，但建议参考 **1.3 节** 获取准确映射。

#### 1.1 注册 (Sign Up)

客户端在注册时，**必须**在 `user_metadata` (SDK 中为 `options.data`) 中携带 `app_slug` 或 `app_id`，否则注册将失败。

**参数要求 (User Metadata)**:

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `app_slug` | String | 是* | App 的唯一别名 (推荐)，如 `voice-chat-pro`。需在中台注册。 |
| `app_id` | UUID | 是* | App 的 UUID。`app_slug` 和 `app_id` 二选一必填。 |
| `invite_code` | String | 否 | 邀请码 (若 App 开启了强制邀请，则可能需要) |
| `display_name` | String | 否 | 用户昵称 |

**代码示例 (Supabase JS SDK)**:

```javascript
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secure-password',
  options: {
    data: {
      app_slug: 'voice-chat-pro', // [重要] 必填，用于归属判定
      display_name: 'John Doe',
      invite_code: 'WELCOME2026'  // 可选
    }
  }
})

if (error) console.error('注册失败:', error.message)
// 成功后，后端会自动创建 platform_user 并建立关联
```

#### 1.2 登录 (Sign In)

使用标准的 Supabase 登录流程。

```javascript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'secure-password'
})
```

#### 1.3 获取业务身份与信息 (Identity & Profile)

登录成功后，推荐通过 `platform_user_bindings` 表获取准确的业务用户 ID (`platform_user_id`)，以兼容多应用账号打通场景。

**步骤**:
1.  **获取绑定关系**: 使用 Auth ID 查询 `platform_user_bindings`。
2.  **获取业务详情**: 使用 `platform_user_id` 查询 `platform_users`。

```javascript
// 1. 获取业务用户 ID
const { data: binding } = await supabase
  .from('platform_user_bindings')
  .select('platform_user_id')
  .eq('external_user_id', user.id)
  .eq('app_id', YOUR_APP_ID) // 当前应用的 ID
  .single()

const platformUserId = binding?.platform_user_id || user.id // 降级策略: 默认一致

// 2. 获取用户信息 (余额、会员状态等)
const { data: profile } = await supabase
  .from('platform_users')
  .select('*, platform_wallets(balance)')
  .eq('id', platformUserId)
  .single()
```

---

### 2. 业务用量上报 (Report Usage)

业务系统（如 AI 对话、语音合成等）在完成一次服务调用后，需调用此接口上报 Token 消耗，以便进行统一计费和审计。

**接口地址**: `POST /functions/v1/report-usage`

**请求头 (Headers)**:
*   `Content-Type`: `application/json`
*   `Authorization`: `Bearer <USER_ACCESS_TOKEN>` (登录接口返回的 access_token)
*   `x-app-id`: `YOUR_APP_KEY` (App ID, UUID格式)
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

### 3. 应用接入管理 (Admin App Manage)

管理员通过此接口管理应用接入，包括创建应用、更新配置（如邀请码开关）、重置密钥等。

**接口地址**: `POST /functions/v1/admin-app-manage` (创建) 或 `PUT /functions/v1/admin-app-manage` (更新)

**权限**: 仅限管理员 (需携带 Admin Token)

**功能 1: 创建应用**

*   **Method**: `POST`
*   **Body**:
    ```json
    {
      "name": "My App",
      "slug": "my-app",   // [必填] 应用唯一标识，用于注册时归属判定
      "description": "App description",
      "invite_required": true // 是否开启邀请码验证
    }
    ```

**功能 2: 更新应用配置**

*   **Method**: `PUT`
*   **Body**:
    ```json
    {
      "action": "update_info",
      "app_id": "UUID",
      "invite_required": false
    }
    ```

### 4. 安全认证机制 (Security & Signature)

为了防止接口被恶意刷量，部分关键接口 (如 `report-usage`) 开启了签名验证。

**签名算法**:

1.  **拼接字符串**: `stringToSign = x-app-id + x-timestamp + JSON.stringify(body)`
2.  **计算 HMAC**: 使用应用的 `app_secret` 对 `stringToSign` 进行 HMAC-SHA256 计算。
3.  **转 Hex**: 将计算结果转换为十六进制字符串，即为 `x-sign`。

**前端示例 (JS)**:

```javascript
import hmacSHA256 from 'crypto-js/hmac-sha256';
import Hex from 'crypto-js/enc-hex';

const timestamp = Date.now().toString();
const bodyStr = JSON.stringify(body);
const stringToSign = appId + timestamp + bodyStr;
const signature = Hex.stringify(hmacSHA256(stringToSign, appSecret));

// Headers
// x-sign: signature
// x-timestamp: timestamp
// x-app-id: appId
```
