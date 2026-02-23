-- 业务中台 Admin 功能迁移 - 数据库扩展草稿
-- 对应 MIGRATION_PLAN_ADMIN.md 中的阶段一

-- ==============================================================================
-- 1. 积分钱包系统 (Wallets)
-- ==============================================================================

create table if not exists public.platform_wallets (
    id uuid primary key default uuid_generate_v4(),
    app_id uuid not null references public.platform_apps(id) on delete cascade,
    platform_user_id uuid not null references public.platform_users(id) on delete cascade,
    
    -- 积分余额
    balance_permanent int default 0, -- 永久积分
    balance_temporary int default 0, -- 临时积分 (每日重置或过期)
    
    version int default 0, -- 乐观锁版本号
    updated_at timestamptz default now(),
    
    unique(app_id, platform_user_id)
);

-- 积分流水表
create table if not exists public.platform_wallet_transactions (
    id uuid primary key default uuid_generate_v4(),
    wallet_id uuid not null references public.platform_wallets(id),
    
    amount int not null, -- 变动金额 (正数增加，负数减少)
    balance_after int not null, -- 变动后余额
    
    type text not null, -- 'deposit', 'usage', 'refund', 'bonus', 'admin_adjustment'
    description text,
    metadata jsonb default '{}'::jsonb, -- 存储关联的订单号、Request ID等
    
    created_at timestamptz default now()
);

-- RLS: 仅管理员和 Service Role 可操作钱包
alter table public.platform_wallets enable row level security;
alter table public.platform_wallet_transactions enable row level security;

create policy "Admins can view all wallets" on public.platform_wallets
    for select using (is_platform_admin());

create policy "Admins can update wallets" on public.platform_wallets
    for update using (is_platform_admin());

create policy "Admins can view transactions" on public.platform_wallet_transactions
    for select using (is_platform_admin());

-- ==============================================================================
-- 2. 统一邀请码系统 (Invite Codes)
-- ==============================================================================

create table if not exists public.platform_invite_codes (
    id uuid primary key default uuid_generate_v4(),
    app_id uuid not null references public.platform_apps(id) on delete cascade,
    
    code text not null,
    
    -- 限制与配置
    valid_days int, -- 有效期天数 (NULL表示永久)
    max_usage int default 1, -- 最大可使用次数
    current_usage int default 0, -- 当前已使用次数
    
    -- 状态管理
    status text default 'active' check (status in ('active', 'expired', 'disabled')),
    
    created_by uuid references auth.users(id), -- 创建者
    expires_at timestamptz, -- 具体过期时间点
    created_at timestamptz default now(),
    
    unique(app_id, code)
);

create table if not exists public.platform_user_invites (
    id uuid primary key default uuid_generate_v4(),
    invite_code_id uuid not null references public.platform_invite_codes(id),
    platform_user_id uuid not null references public.platform_users(id),
    
    used_at timestamptz default now(),
    
    unique(invite_code_id, platform_user_id)
);

-- RLS
alter table public.platform_invite_codes enable row level security;
alter table public.platform_user_invites enable row level security;

create policy "Admins can manage invite codes" on public.platform_invite_codes
    for all using (is_platform_admin());

create policy "Admins can view invite usage" on public.platform_user_invites
    for select using (is_platform_admin());

-- ==============================================================================
-- 3. RPC Functions (Atomic Operations)
-- ==============================================================================

-- 3.1 调整钱包余额 (支持原子操作)
create or replace function public.adjust_wallet_balance(
    _wallet_id uuid,
    _amount int,
    _type text,
    _description text default null,
    _metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer -- 使用定义者权限执行 (通常是 admin/postgres)
as $$
declare
    _new_balance int;
    _wallet_exists boolean;
begin
    -- 检查钱包是否存在并锁定行
    select true into _wallet_exists from public.platform_wallets where id = _wallet_id for update;
    
    if not found then
        return jsonb_build_object('success', false, 'error', 'Wallet not found');
    end if;

    -- 更新余额
    update public.platform_wallets
    set balance_permanent = balance_permanent + _amount,
        updated_at = now()
    where id = _wallet_id
    returning balance_permanent into _new_balance;

    -- 插入流水
    insert into public.platform_wallet_transactions (
        wallet_id, amount, balance_after, type, description, metadata
    ) values (
        _wallet_id, _amount, _new_balance, _type, _description, _metadata
    );

    return jsonb_build_object('success', true, 'new_balance', _new_balance);
exception when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

-- 3.2 验证并使用邀请码
create or replace function public.redeem_invite_code(
    _app_id uuid,
    _code text,
    _platform_user_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
    _invite_record record;
begin
    -- 查找并锁定邀请码记录
    select * into _invite_record 
    from public.platform_invite_codes 
    where app_id = _app_id and code = _code 
    for update;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Invalid code');
    end if;

    -- 验证状态
    if _invite_record.status != 'active' then
        return jsonb_build_object('success', false, 'error', 'Code is not active');
    end if;

    -- 验证过期时间
    if _invite_record.expires_at is not null and _invite_record.expires_at < now() then
        return jsonb_build_object('success', false, 'error', 'Code expired');
    end if;

    -- 验证使用次数
    if _invite_record.max_usage > 0 and _invite_record.current_usage >= _invite_record.max_usage then
        return jsonb_build_object('success', false, 'error', 'Max usage reached');
    end if;

    -- 验证用户是否已使用过该码 (幂等性检查)
    if exists (select 1 from public.platform_user_invites where invite_code_id = _invite_record.id and platform_user_id = _platform_user_id) then
        return jsonb_build_object('success', false, 'error', 'Already redeemed');
    end if;

    -- 更新使用次数
    update public.platform_invite_codes
    set current_usage = current_usage + 1,
        updated_at = now()
    where id = _invite_record.id;

    -- 插入使用记录
    insert into public.platform_user_invites (
        invite_code_id, platform_user_id
    ) values (
        _invite_record.id, _platform_user_id
    );

    return jsonb_build_object('success', true, 'invite_id', _invite_record.id);
exception when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;
