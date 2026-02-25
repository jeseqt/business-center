-- 允许普通用户查看自己的数据
-- 请在 Supabase SQL Editor 中执行此脚本

-- 1. 允许用户查看自己的 platform_users 记录
create policy "Users can view own profile" on public.platform_users
    for select using (external_user_id = auth.uid()::text);

-- 2. 允许用户查看自己的钱包 (通过关联 platform_users)
create policy "Users can view own wallet" on public.platform_wallets
    for select using (
        exists (
            select 1 from public.platform_users
            where id = platform_wallets.platform_user_id
            and external_user_id = auth.uid()::text
        )
    );

-- 3. 允许用户查看自己的钱包流水
create policy "Users can view own transactions" on public.platform_wallet_transactions
    for select using (
        exists (
            select 1 from public.platform_wallets
            join public.platform_users on platform_users.id = platform_wallets.platform_user_id
            where platform_wallets.id = platform_wallet_transactions.wallet_id
            and platform_users.external_user_id = auth.uid()::text
        )
    );

-- 4. 允许用户查看自己的订单
create policy "Users can view own orders" on public.platform_orders
    for select using (
        exists (
            select 1 from public.platform_users
            where id = platform_orders.platform_user_id
            and external_user_id = auth.uid()::text
        )
    );
    
-- 5. 允许用户查看自己的 Token 用量
create policy "Users can view own token usage" on public.platform_token_usage
    for select using (
        exists (
            select 1 from public.platform_users
            where id = platform_token_usage.platform_user_id
            and external_user_id = auth.uid()::text
        )
    );
