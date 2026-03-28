-- Enable RLS on platform_users
ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;

-- User Policies for platform_users
DROP POLICY IF EXISTS "Users can view own profile" ON public.platform_users;
CREATE POLICY "Users can view own profile" ON public.platform_users
    FOR SELECT USING (external_user_id::text = auth.uid()::text);

DROP POLICY IF EXISTS "Users can update own profile" ON public.platform_users;
CREATE POLICY "Users can update own profile" ON public.platform_users
    FOR UPDATE USING (external_user_id::text = auth.uid()::text);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.platform_users;
CREATE POLICY "Users can insert own profile" ON public.platform_users
    FOR INSERT WITH CHECK (external_user_id::text = auth.uid()::text);

-- Admin Policies for platform_users
DROP POLICY IF EXISTS "Admins can view all users" ON public.platform_users;
CREATE POLICY "Admins can view all users" ON public.platform_users
    FOR SELECT USING (is_platform_admin());

DROP POLICY IF EXISTS "Admins can update users" ON public.platform_users;
CREATE POLICY "Admins can update users" ON public.platform_users
    FOR UPDATE USING (is_platform_admin());

-- Enable RLS on platform_wallets
ALTER TABLE public.platform_wallets ENABLE ROW LEVEL SECURITY;

-- User Policies for platform_wallets
DROP POLICY IF EXISTS "Users can view own wallet" ON public.platform_wallets;
CREATE POLICY "Users can view own wallet" ON public.platform_wallets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.platform_users
            WHERE id = platform_wallets.platform_user_id
            AND external_user_id::text = auth.uid()::text
        )
    );

-- Admin Policies for platform_wallets
DROP POLICY IF EXISTS "Admins can view all wallets" ON public.platform_wallets;
CREATE POLICY "Admins can view all wallets" ON public.platform_wallets
    FOR SELECT USING (is_platform_admin());

DROP POLICY IF EXISTS "Admins can update wallets" ON public.platform_wallets;
CREATE POLICY "Admins can update wallets" ON public.platform_wallets
    FOR UPDATE USING (is_platform_admin());


-- Enable RLS on platform_wallet_transactions
ALTER TABLE public.platform_wallet_transactions ENABLE ROW LEVEL SECURITY;

-- User Policies for platform_wallet_transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON public.platform_wallet_transactions;
CREATE POLICY "Users can view own transactions" ON public.platform_wallet_transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.platform_wallets
            JOIN public.platform_users ON platform_users.id = platform_wallets.platform_user_id
            WHERE platform_wallets.id = platform_wallet_transactions.wallet_id
            AND platform_users.external_user_id::text = auth.uid()::text
        )
    );

-- Admin Policies for platform_wallet_transactions
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.platform_wallet_transactions;
CREATE POLICY "Admins can view all transactions" ON public.platform_wallet_transactions
    FOR SELECT USING (is_platform_admin());
