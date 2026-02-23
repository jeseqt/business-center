
-- 20260224000003_add_user_bindings.sql
-- 目的：引入 platform_user_bindings 表，支持一个用户在不同系统中拥有多个 ID

create table if not exists public.platform_user_bindings (
    id uuid primary key default gen_random_uuid(),
    platform_user_id uuid not null references public.platform_users(id) on delete cascade,
    
    -- 来源应用的 App ID
    app_id uuid not null references public.platform_apps(id) on delete cascade,
    
    -- 该用户在这个 App 里的 ID (例如 Auth ID, 微信 OpenID, 旧业务 ID)
    external_user_id text not null,
    
    -- 绑定类型: 'auth_user_id' (Supabase Auth), 'wechat_openid', 'app_user_id' (业务ID)
    identity_type text default 'auth_user_id',
    
    -- 额外元数据 (例如 accessToken, refreshToken 等，虽然通常不建议存这里)
    metadata jsonb default '{}'::jsonb,
    
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    
    -- 联合唯一：同一个 App 下的同一个外部 ID 只能绑定到一个中台用户
    unique(app_id, external_user_id, identity_type)
);

-- 索引：加速查找
create index if not exists idx_platform_user_bindings_ext_id on public.platform_user_bindings(external_user_id);
create index if not exists idx_platform_user_bindings_user_id on public.platform_user_bindings(platform_user_id);

-- 数据迁移：将现有的 platform_users.external_user_id 迁移为第一条绑定记录
insert into public.platform_user_bindings (platform_user_id, app_id, external_user_id, identity_type)
select 
    id, 
    app_id, 
    external_user_id, 
    'auth_user_id' -- 假设现在的 ID 都是 Supabase Auth ID
from public.platform_users
on conflict (app_id, external_user_id, identity_type) do nothing;
