# 业务中台 Admin 功能迁移方案

本方案旨在将 `voice-reflect-ai` 项目中的管理员功能（`/admin`）剥离并迁移至 `business-center` 业务中台，实现对多业务系统的统一管理。

## 1. 迁移目标
建立统一的 **中台管理控制台 (Business Admin Console)**，集中管理以下核心资产：
*   **用户管理**：跨应用的统一用户视图。
*   **积分/支付管理**：统一的积分钱包与订单管理。
*   **增长管理**：统一的邀请码生成与分发系统。
*   **业务配置**：提供框架以集成各业务系统的特定配置（如 AI 模型参数）。

## 2. 总体架构设计

```mermaid
graph TD
    subgraph "业务中台 (Business Center)"
        BC_DB[(中台数据库)]
        BC_API[中台 Edge Functions]
        BC_Admin[**[新增] 中台管理控制台**]
    end

    subgraph "业务系统 (Voice Reflect AI)"
        VR_App[用户端 App]
        VR_API[业务 Edge Functions]
    end

    BC_Admin -->|调用| BC_API
    BC_API -->|读写| BC_DB
    VR_API -->|API/RPC| BC_API
    VR_App -->|使用积分/验证邀请码| VR_API
```

## 3. 详细实施步骤

### 阶段一：数据库扩展 (Schema Migration)

需要在 `business-center` 中增加积分钱包和邀请码相关的表结构。

#### 3.1 新增积分钱包表 (`platform_wallets`)
用于替代业务系统中的 `points` 字段。

```sql
create table if not exists public.platform_wallets (
    id uuid primary key default uuid_generate_v4(),
    app_id uuid not null references public.platform_apps(id) on delete cascade,
    platform_user_id uuid not null references public.platform_users(id) on delete cascade,
    
    -- 余额字段
    balance_permanent int default 0, -- 永久积分
    balance_temporary int default 0, -- 临时积分
    
    updated_at timestamptz default now(),
    unique(app_id, platform_user_id)
);

-- 账变记录表
create table if not exists public.platform_wallet_transactions (
    id uuid primary key default uuid_generate_v4(),
    wallet_id uuid not null references public.platform_wallets(id),
    amount int not null, -- 变动金额 (+/-)
    type text not null, -- 'deposit', 'withdraw', 'refund', 'bonus'
    reference_id text, -- 关联订单号或业务ID
    description text,
    created_at timestamptz default now()
);
```

#### 3.2 新增邀请码表 (`platform_invite_codes`)
将邀请码提升为平台级服务，支持按应用隔离。

```sql
create table if not exists public.platform_invite_codes (
    id uuid primary key default uuid_generate_v4(),
    app_id uuid not null references public.platform_apps(id) on delete cascade,
    code text not null,
    
    -- 配置
    valid_days int default 30, -- 有效期(天)
    max_usage int default 1,   -- 最大使用次数 (1为一次性)
    
    -- 状态
    status text default 'active' check (status in ('active', 'expired', 'disabled')),
    created_by uuid references auth.users(id), -- 创建者(管理员)
    expires_at timestamptz,
    created_at timestamptz default now(),
    
    unique(app_id, code) -- 同一应用下邀请码唯一
);

-- 邀请码使用记录
create table if not exists public.platform_user_invites (
    id uuid primary key default uuid_generate_v4(),
    invite_code_id uuid not null references public.platform_invite_codes(id),
    platform_user_id uuid not null references public.platform_users(id),
    used_at timestamptz default now(),
    unique(invite_code_id, platform_user_id) -- 防止重复使用同一码
);
```

### 阶段二：后端服务扩展 (Edge Functions)

在 `business-center/supabase/functions` 下开发以下管理端接口：

1.  **`admin-user-list`**:
    *   功能：分页获取 `platform_users`，支持按 `app_id`、`email` (metadata中) 搜索。
    *   权限：仅限 `platform_admin`。

2.  **`admin-wallet-manage`**:
    *   功能：查看用户钱包余额，手动调整积分（充值/扣除）。
    *   权限：仅限 `platform_admin`。

3.  **`admin-invite-manage`**:
    *   功能：批量生成邀请码，查询邀请码列表及使用情况。
    *   权限：仅限 `platform_admin`。

4.  **`api-verify-invite` (供业务系统调用)**:
    *   功能：验证邀请码有效性并绑定用户。
    *   权限：`service_role` (业务系统服务端调用) 或 `anon` (需配合 App Key 签名)。

### 阶段三：前端建设 (Admin Portal)

建议在 `business-center` 根目录下初始化一个新的前端项目 `admin-portal`。

*   **技术栈**: Vite + React + TypeScript + Shadcn UI (与 Voice Reflect 保持一致)。
*   **页面迁移规划**:

| 原 Voice Reflect 页面 | 迁移至 Admin Portal 页面 | 功能改造点 |
| :--- | :--- | :--- |
| `UnifiedAdminDashboard` | `/users` (用户列表) | 数据源改为 `platform_users`；增加“所属应用”列。 |
| `PointsAdminPage` | `/finance/wallets` (积分管理) | 数据源改为 `platform_wallets`；增加流水查询。 |
| `AdminPanel` (部分) | `/growth/invites` (邀请码) | 增加“选择应用”下拉框，生成特定应用的邀请码。 |
| `AdminLogin` | `/login` | 登录逻辑改为验证 `platform_admin_profiles` 表。 |

### 阶段四：数据迁移策略

由于不直接动代码，以下为执行逻辑：

1.  **用户同步**: 编写脚本，将 `voice-reflect-ai` 的 `profiles` 表数据导入中台 `platform_users`。
    *   映射关系: `profiles.id` -> `platform_users.external_user_id`。
2.  **积分迁移**: 将 `profiles.points` 数据迁移至 `platform_wallets`。
    *   注意：需区分永久积分和临时积分。
3.  **邀请码迁移**: 将 `invite_codes` 和 `user_invite_codes` 迁移至中台对应表。

## 4. 对 Voice Reflect AI 的影响与后续调整

完成上述迁移后，`voice-reflect-ai` 需要进行以下调整（本方案暂不执行，仅列出）：
1.  **移除前端管理页**: 删除 `/admin` 路由及其相关组件。
2.  **调整积分逻辑**: 业务代码中涉及扣费的地方，需改为调用中台 `report-usage` 或新的扣费 API。
3.  **调整邀请码逻辑**: 注册/登录时的邀请码验证，需改为调用中台接口。

## 5. 立即执行建议

建议优先执行 **阶段一 (数据库扩展)** 和 **阶段三 (前端初始化)**，搭建起中台管理的骨架，然后逐步进行数据和逻辑的割接。
