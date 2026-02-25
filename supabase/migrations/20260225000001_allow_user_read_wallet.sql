-- 允许普通用户查看自己的数据

-- 1. platform_users
drop policy if exists "Users can view own profile" on public.platform_users;
create policy "Users can view own profile" on public.platform_users
    for select using (external_user_id = auth.uid());

-- 2. platform_wallets
drop policy if exists "Users can view own wallet" on public.platform_wallets;
create policy "Users can view own wallet" on public.platform_wallets
    for select using (
        exists (
            select 1 from public.platform_users
            where id = platform_wallets.platform_user_id
            and external_user_id = auth.uid()
        )
    );

-- 3. platform_wallet_transactions
drop policy if exists "Users can view own transactions" on public.platform_wallet_transactions;
create policy "Users can view own transactions" on public.platform_wallet_transactions
    for select using (
        exists (
            select 1 from public.platform_wallets
            join public.platform_users on platform_users.id = platform_wallets.platform_user_id
            where platform_wallets.id = platform_wallet_transactions.wallet_id
            and platform_users.external_user_id = auth.uid()
        )
    );
