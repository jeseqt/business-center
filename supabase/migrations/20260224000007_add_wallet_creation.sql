
-- 20260224000007_add_wallet_creation.sql
-- 目的：
-- 1. 确保钱包表 (platform_wallets) 存在
-- 2. 确保钱包交易表 (platform_wallet_transactions) 存在
-- 3. 更新触发器逻辑，确保新用户自动创建钱包
-- 4. 回填现有用户，为其主 App 创建钱包

-- ==============================================================================
-- 1. 确保钱包表存在
-- ==============================================================================
create table if not exists public.platform_wallets (
    id uuid primary key default gen_random_uuid(),
    app_id uuid not null references public.platform_apps(id) on delete cascade,
    platform_user_id uuid not null references public.platform_users(id) on delete cascade,
    
    -- 积分余额
    balance_permanent int default 0, -- 永久积分
    balance_temporary int default 0, -- 临时积分 (每日重置或过期)
    
    version int default 0, -- 乐观锁版本号
    updated_at timestamptz default now(),
    
    unique(app_id, platform_user_id)
);

-- ==============================================================================
-- 2. 确保钱包交易表存在
-- ==============================================================================
create table if not exists public.platform_wallet_transactions (
    id uuid primary key default gen_random_uuid(),
    wallet_id uuid not null references public.platform_wallets(id),
    
    amount int not null, -- 变动金额 (正数增加，负数减少)
    balance_after int not null, -- 变动后余额
    
    type text not null, -- 'deposit', 'usage', 'refund', 'bonus', 'admin_adjustment'
    description text,
    metadata jsonb default '{}'::jsonb, -- 存储关联的订单号、Request ID等
    
    created_at timestamptz default now()
);

-- RLS: 启用并配置基本策略
alter table public.platform_wallets enable row level security;
alter table public.platform_wallet_transactions enable row level security;

-- 删除旧策略以避免冲突
drop policy if exists "Admins can view all wallets" on public.platform_wallets;
drop policy if exists "Admins can update wallets" on public.platform_wallets;
drop policy if exists "Admins can view transactions" on public.platform_wallet_transactions;

-- 允许 Service Role (Edge Functions) 和 Admins 完全访问
create policy "Admins can view all wallets" on public.platform_wallets
    for select using (is_platform_admin());

create policy "Admins can update wallets" on public.platform_wallets
    for update using (is_platform_admin());

create policy "Admins can view transactions" on public.platform_wallet_transactions
    for select using (is_platform_admin());

-- ==============================================================================
-- 3. 更新触发器逻辑：自动创建钱包
-- ==============================================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
as $$
declare
    v_app_id uuid;
    v_app_slug text;
    v_input_app_id uuid;
    v_existing_user_id uuid;
    v_target_user_id uuid;
begin
    -- 1. 从 user_metadata 获取应用标识
    v_app_slug := new.raw_user_meta_data->>'app_slug';
    
    if v_app_slug is not null then
        select id into v_app_id from public.platform_apps where slug = v_app_slug limit 1;
        if v_app_id is null then
            raise exception 'Invalid app_slug provided: %', v_app_slug;
        end if;
    else
        begin
            v_input_app_id := (new.raw_user_meta_data->>'app_id')::uuid;
        exception when others then
            v_input_app_id := null;
        end;

        if v_input_app_id is not null then
            select id into v_app_id from public.platform_apps where id = v_input_app_id limit 1;
            if v_app_id is null then
                raise exception 'Invalid app_id provided: %', v_input_app_id;
            end if;
        end if;
    end if;

    -- 2. 强制校验：必须提供有效的 App 归属
    if v_app_id is null then
        raise exception 'Registration requires a valid app_slug or app_id in user_metadata';
    end if;

    -- 3. 检查是否存在同名邮箱的 platform_user
    select id into v_existing_user_id
    from public.platform_users
    where email = new.email
    limit 1;

    if v_existing_user_id is not null then
        v_target_user_id := v_existing_user_id;

        -- A. 用户已存在：更新 external_user_id 并添加绑定
        update public.platform_users
        set external_user_id = new.id::text,
            email = new.email,
            last_active_at = now()
        where id = v_existing_user_id;
        
        insert into public.platform_user_bindings (platform_user_id, app_id, external_user_id, identity_type)
        values (v_existing_user_id, v_app_id, new.id::text, 'auth_user_id')
        on conflict (app_id, external_user_id, identity_type) do nothing;
        
    else
        v_target_user_id := new.id;

        -- B. 用户不存在：创建新用户
        insert into public.platform_users (
            id,
            app_id,
            external_user_id,
            email,
            status,
            metadata
        ) values (
            new.id,
            v_app_id,
            new.id::text,
            new.email,
            'active',
            jsonb_build_object(
                'source', 'auth_trigger',
                'display_name', coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
            )
        );

        insert into public.platform_user_bindings (platform_user_id, app_id, external_user_id, identity_type)
        values (new.id, v_app_id, new.id::text, 'auth_user_id')
        on conflict (app_id, external_user_id, identity_type) do nothing;
    end if;

    -- 4. [新增] 自动为当前 App 创建钱包 (如果不存在)
    insert into public.platform_wallets (app_id, platform_user_id, balance_permanent)
    values (v_app_id, v_target_user_id, 0)
    on conflict (app_id, platform_user_id) do nothing;

    return new;
end;
$$;

-- ==============================================================================
-- 4. 回填数据：为现有用户创建钱包
-- ==============================================================================
-- 针对所有现有的 platform_users，为其归属的 App 创建钱包
insert into public.platform_wallets (app_id, platform_user_id, balance_permanent)
select app_id, id, 0
from public.platform_users
on conflict (app_id, platform_user_id) do nothing;
