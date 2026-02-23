-- ==============================================================================
-- 业务中台 (Business Center) 数据库初始化脚本
-- 版本: 1.0.0
-- 描述: 创建中台核心表结构、索引及 RLS 策略
-- ==============================================================================

-- 启用必要的扩展
create extension if not exists "uuid-ossp";

-- ==============================================================================
-- 1. 基础租户管理 (Platform Apps)
-- ==============================================================================
create table if not exists public.platform_apps (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    description text,
    app_key text unique not null,
    -- 存储 App Secret 的哈希值，实际 Secret 仅在创建时显示一次
    app_secret_hash text not null,
    -- Webhook 回调地址，用于接收充值成功、告警等通知
    webhook_url text,
    -- 应用状态: 'active', 'suspended', 'development'
    status text default 'active' check (status in ('active', 'suspended', 'development')),
    -- 每日 Token 消耗限额 (null 表示无限制)
    daily_token_limit bigint,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 索引
create index idx_platform_apps_app_key on public.platform_apps(app_key);

-- ==============================================================================
-- 2. 统一用户中心 (Platform Users)
-- ==============================================================================
create table if not exists public.platform_users (
    id uuid primary key default uuid_generate_v4(),
    app_id uuid not null references public.platform_apps(id) on delete cascade,
    -- 业务方(Voice Reflect)的用户ID
    external_user_id text not null,
    -- 用户元数据快照 (昵称、头像等，仅供中台展示用)
    metadata jsonb default '{}'::jsonb,
    -- 用户状态: 'active', 'blocked'
    status text default 'active' check (status in ('active', 'blocked')),
    created_at timestamptz default now(),
    last_active_at timestamptz,
    
    -- 联合唯一索引: 同一个应用下 external_user_id 必须唯一
    unique(app_id, external_user_id)
);

-- 索引
create index idx_platform_users_app_ext_id on public.platform_users(app_id, external_user_id);

-- ==============================================================================
-- 3. Token 计费中心 (Token Usage)
-- ==============================================================================
create table if not exists public.platform_token_usage (
    id uuid primary key default uuid_generate_v4(),
    app_id uuid not null references public.platform_apps(id) on delete cascade,
    platform_user_id uuid references public.platform_users(id) on delete set null,
    
    -- 模型名称 (e.g., 'gpt-4o', 'claude-3-5-sonnet')
    model_name text not null,
    -- 消耗详情
    prompt_tokens int default 0,
    completion_tokens int default 0,
    total_tokens int default 0,
    -- 计算后的预估成本 (美元)
    cost_usd decimal(10, 6) default 0,
    
    -- 业务关联元数据 (如 reflection_id, session_id)
    request_metadata jsonb default '{}'::jsonb,
    
    created_at timestamptz default now()
);

-- 索引 (用于生成报表)
create index idx_token_usage_app_date on public.platform_token_usage(app_id, created_at);
create index idx_token_usage_user on public.platform_token_usage(platform_user_id);

-- ==============================================================================
-- 4. 统一订单中心 (Orders)
-- ==============================================================================
create table if not exists public.platform_orders (
    id uuid primary key default uuid_generate_v4(),
    app_id uuid not null references public.platform_apps(id) on delete cascade,
    platform_user_id uuid references public.platform_users(id) on delete set null,
    
    -- 业务方订单号 (必须在应用内唯一)
    merchant_order_no text not null,
    -- 中台全局唯一流水号
    platform_order_no text unique not null,
    
    -- 支付金额 (单位: 分)
    amount int not null check (amount > 0),
    currency text default 'CNY',
    
    -- 支付渠道
    channel text check (channel in ('wechat', 'alipay', 'stripe', 'apple', 'mock')),
    
    -- 订单状态
    status text default 'pending' check (status in ('pending', 'paying', 'paid', 'failed', 'refunded', 'closed')),
    
    -- 商品快照信息
    product_info jsonb default '{}'::jsonb,
    
    -- 支付时间信息
    created_at timestamptz default now(),
    paid_at timestamptz,
    updated_at timestamptz default now(),
    
    -- 联合唯一约束
    unique(app_id, merchant_order_no)
);

-- 索引
create index idx_orders_app_status on public.platform_orders(app_id, status);
create index idx_orders_merchant_no on public.platform_orders(merchant_order_no);
create index idx_orders_platform_no on public.platform_orders(platform_order_no);

-- ==============================================================================
-- 5. 中台管理员 (Platform Admins)
-- ==============================================================================
-- 该表用于关联 Supabase Auth 用户，赋予其访问中台数据的权限
create table if not exists public.platform_admin_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    role text default 'admin' check (role in ('super_admin', 'admin', 'viewer')),
    created_at timestamptz default now()
);

-- ==============================================================================
-- 6. 安全策略 (RLS)
-- ==============================================================================

-- 启用 RLS
alter table public.platform_apps enable row level security;
alter table public.platform_users enable row level security;
alter table public.platform_token_usage enable row level security;
alter table public.platform_orders enable row level security;
alter table public.platform_admin_profiles enable row level security;

-- 策略定义: 
-- 1. Service Role (Edge Functions) 拥有完全访问权限
-- 2. 中台管理员 (Platform Admin) 可以读取所有数据

-- Helper function: 检查当前用户是否为中台管理员
create or replace function public.is_platform_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.platform_admin_profiles
    where id = auth.uid()
  );
end;
$$ language plpgsql security definer;

-- --- platform_apps ---
create policy "Admins can view apps" on public.platform_apps
    for select using (is_platform_admin());
    
create policy "Admins can update apps" on public.platform_apps
    for update using (is_platform_admin());

create policy "Admins can insert apps" on public.platform_apps
    for insert with check (is_platform_admin());

-- --- platform_users ---
create policy "Admins can view users" on public.platform_users
    for select using (is_platform_admin());

-- --- platform_token_usage ---
create policy "Admins can view token usage" on public.platform_token_usage
    for select using (is_platform_admin());

-- --- platform_orders ---
create policy "Admins can view orders" on public.platform_orders
    for select using (is_platform_admin());

-- --- platform_admin_profiles ---
create policy "Admins can view admin profiles" on public.platform_admin_profiles
    for select using (is_platform_admin());
    
-- 注意：Service Role 默认绕过 RLS，无需显式 Policy

-- ==============================================================================
-- 7. 触发器 (自动更新 updated_at)
-- ==============================================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_platform_apps_updated
  before update on public.platform_apps
  for each row execute procedure public.handle_updated_at();

create trigger on_platform_orders_updated
  before update on public.platform_orders
  for each row execute procedure public.handle_updated_at();

