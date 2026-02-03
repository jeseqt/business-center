-- ==============================================================================
-- 统一钱包与邀请码升级脚本
-- 版本: 1.1.0
-- 描述: 将钱包系统从 App 隔离改为全局统一，支持跨 App 消费；邀请码支持全局通用。
-- ==============================================================================

-- 1. 重构钱包系统 (Global Wallets)
-- 删除旧的基于 App 隔离的钱包表 (假设尚无生产数据，直接重建)
drop table if exists public.platform_wallet_transactions;
drop table if exists public.platform_wallets;

create table public.platform_wallets (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade, -- 绑定全局 Auth 用户
    
    balance int default 0, -- 统一余额 (分)
    currency text default 'CNY',
    
    version int default 0, -- 乐观锁
    updated_at timestamptz default now(),
    
    unique(user_id)
);

create table public.platform_wallet_transactions (
    id uuid primary key default uuid_generate_v4(),
    wallet_id uuid not null references public.platform_wallets(id) on delete cascade,
    
    amount int not null, -- 变动金额
    balance_after int not null, -- 变动后余额
    
    type text not null, -- 'deposit'(充值), 'payment'(支付), 'refund'(退款), 'admin'(管理员调整)
    
    -- 交易上下文
    app_id uuid references public.platform_apps(id) on delete set null, -- 发生在哪个 App
    order_id uuid references public.platform_orders(id) on delete set null, -- 关联哪个订单
    
    description text,
    metadata jsonb default '{}'::jsonb,
    
    created_at timestamptz default now()
);

-- RLS 策略
alter table public.platform_wallets enable row level security;
alter table public.platform_wallet_transactions enable row level security;

-- Policy: 用户可见自己的钱包
create policy "Users can view own wallet" on public.platform_wallets
    for select using (auth.uid() = user_id);

-- Policy: 管理员可见所有钱包
create policy "Admins can view all wallets" on public.platform_wallets
    for select using (is_platform_admin());

-- Policy: 管理员可修改所有钱包 (通过 RPC 更好，但这里开放写权限给 Admin)
create policy "Admins can update wallets" on public.platform_wallets
    for update using (is_platform_admin());

-- Policy: 用户可见自己的流水
create policy "Users can view own transactions" on public.platform_wallet_transactions
    for select using (
        exists (
            select 1 from public.platform_wallets w 
            where w.id = platform_wallet_transactions.wallet_id 
            and w.user_id = auth.uid()
        )
    );

-- Policy: 管理员可见所有流水
create policy "Admins can view all transactions" on public.platform_wallet_transactions
    for select using (is_platform_admin());

-- 2. 升级邀请码系统
-- 注意：邀请码必须归属于特定 App，不支持全局邀请码。

-- 新增全局邀请记录表 (记录哪个用户使用了哪个邀请码)
create table public.platform_global_user_invites (
    id uuid primary key default uuid_generate_v4(),
    invite_code_id uuid not null references public.platform_invite_codes(id),
    user_id uuid not null references auth.users(id), -- Global User ID
    
    used_at timestamptz default now(),
    
    unique(invite_code_id, user_id)
);

alter table public.platform_global_user_invites enable row level security;

create policy "Admins can view global invite usage" on public.platform_global_user_invites
    for select using (is_platform_admin());

-- 3. RPC: 统一钱包扣费/充值函数
create or replace function public.process_wallet_transaction(
    _user_id uuid,
    _amount int, -- 正数充值，负数扣费
    _type text,
    _app_id uuid default null,
    _order_id uuid default null,
    _description text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
    _wallet_id uuid;
    _current_balance int;
    _new_balance int;
begin
    -- 1. 获取或创建钱包
    select id, balance into _wallet_id, _current_balance
    from public.platform_wallets
    where user_id = _user_id
    for update; -- 锁定行
    
    if not found then
        insert into public.platform_wallets (user_id, balance)
        values (_user_id, 0)
        returning id, balance into _wallet_id, _current_balance;
    end if;
    
    -- 2. 检查余额 (如果是扣费)
    if _amount < 0 and (_current_balance + _amount) < 0 then
        return jsonb_build_object('success', false, 'error', 'Insufficient balance');
    end if;
    
    -- 3. 更新余额
    _new_balance := _current_balance + _amount;
    
    update public.platform_wallets
    set balance = _new_balance,
        updated_at = now()
    where id = _wallet_id;
    
    -- 4. 记录流水
    insert into public.platform_wallet_transactions (
        wallet_id, amount, balance_after, type, app_id, order_id, description
    ) values (
        _wallet_id, _amount, _new_balance, _type, _app_id, _order_id, _description
    );
    
    return jsonb_build_object('success', true, 'new_balance', _new_balance);
exception when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

-- 4. RPC: 验证并使用邀请码 (强制校验 App ID)
create or replace function public.redeem_global_invite_code(
    _user_id uuid, -- Auth User ID
    _code text,
    _app_id uuid -- 必须指定 App ID
)
returns jsonb
language plpgsql
security definer
as $$
declare
    _invite_record record;
begin
    if _app_id is null then
        return jsonb_build_object('success', false, 'error', 'App ID is required');
    end if;

    -- 查找邀请码，必须匹配 App ID
    select * into _invite_record 
    from public.platform_invite_codes 
    where code = _code 
      and app_id = _app_id
    for update;
    
    if not found then
        return jsonb_build_object('success', false, 'error', 'Invalid code or code not belongs to this app');
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

    -- 验证用户是否已使用过该码
    if exists (select 1 from public.platform_global_user_invites where invite_code_id = _invite_record.id and user_id = _user_id) then
        return jsonb_build_object('success', false, 'error', 'Already redeemed');
    end if;

    -- 更新使用次数
    update public.platform_invite_codes
    set current_usage = current_usage + 1,
        updated_at = now()
    where id = _invite_record.id;

    -- 插入使用记录
    insert into public.platform_global_user_invites (
        invite_code_id, user_id
    ) values (
        _invite_record.id, _user_id
    );

    return jsonb_build_object('success', true, 'invite_id', _invite_record.id);
exception when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

-- 5. Trigger for updated_at
create trigger on_platform_wallets_updated
  before update on public.platform_wallets
  for each row execute procedure public.handle_updated_at();
