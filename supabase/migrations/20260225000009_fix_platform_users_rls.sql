-- 确保 platform_users 启用 RLS
ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;

-- 删除旧策略以避免冲突
DROP POLICY IF EXISTS "Users can view own profile" ON public.platform_users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.platform_users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.platform_users;

-- 1. 允许用户查看自己的档案
CREATE POLICY "Users can view own profile" ON public.platform_users
    FOR SELECT USING (external_user_id = auth.uid()::text);

-- 2. 允许用户创建自己的档案 (用于自动修复逻辑)
CREATE POLICY "Users can insert own profile" ON public.platform_users
    FOR INSERT WITH CHECK (external_user_id = auth.uid()::text);

-- 3. 允许用户更新自己的档案
CREATE POLICY "Users can update own profile" ON public.platform_users
    FOR UPDATE USING (external_user_id = auth.uid()::text);

-- 确保 platform_wallets 启用 RLS
ALTER TABLE public.platform_wallets ENABLE ROW LEVEL SECURITY;

-- 钱包策略 (保持不变，但确保存在)
DROP POLICY IF EXISTS "Users can view own wallet" ON public.platform_wallets;
CREATE POLICY "Users can view own wallet" ON public.platform_wallets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.platform_users
            WHERE id = platform_wallets.platform_user_id
            AND external_user_id = auth.uid()::text
        )
    );

-- 交易记录策略
ALTER TABLE public.platform_wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own transactions" ON public.platform_wallet_transactions;
CREATE POLICY "Users can view own transactions" ON public.platform_wallet_transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.platform_wallets
            JOIN public.platform_users ON platform_users.id = platform_wallets.platform_user_id
            WHERE platform_wallets.id = platform_wallet_transactions.wallet_id
            AND platform_users.external_user_id = auth.uid()::text
        )
    );
