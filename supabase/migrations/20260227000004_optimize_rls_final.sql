-- Migration ID: 20260227000004_optimize_rls_final
-- Description: Final RLS optimization for platform_users, platform_wallets and transactions.
-- Ensures strict data isolation while allowing necessary access.

-- ==============================================================================
-- 1. Optimize platform_users RLS
-- ==============================================================================
ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own profile" ON public.platform_users;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.platform_users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.platform_users;
DROP POLICY IF EXISTS "Authenticated users can view active apps" ON public.platform_users; -- Cleanup misnamed policy if any

-- Allow users to see their own profile
-- external_user_id matches auth.uid()
CREATE POLICY "Users can view own profile" ON public.platform_users
    FOR SELECT
    USING (external_user_id = auth.uid()::uuid);

-- Allow admins to see everything
-- Uses the SECURITY DEFINER function is_platform_admin() to bypass RLS recursion
CREATE POLICY "Admins can view all profiles" ON public.platform_users
    FOR ALL
    USING (is_platform_admin());


-- ==============================================================================
-- 2. Optimize platform_wallets RLS
-- ==============================================================================
ALTER TABLE public.platform_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own wallet" ON public.platform_wallets;
DROP POLICY IF EXISTS "Admins can view all wallets" ON public.platform_wallets;

-- Allow users to see their own wallet (via platform_users link)
CREATE POLICY "Users can view own wallet" ON public.platform_wallets
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.platform_users 
            WHERE id = platform_wallets.platform_user_id 
            AND external_user_id = auth.uid()::uuid
        )
    );

-- Allow admins to see everything
CREATE POLICY "Admins can view all wallets" ON public.platform_wallets
    FOR ALL
    USING (is_platform_admin());


-- ==============================================================================
-- 3. Optimize platform_wallet_transactions RLS
-- ==============================================================================
ALTER TABLE public.platform_wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transactions" ON public.platform_wallet_transactions;
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.platform_wallet_transactions;
DROP POLICY IF EXISTS "Admins can view transactions" ON public.platform_wallet_transactions;

-- Allow users to see their own transactions (via wallet -> user link)
CREATE POLICY "Users can view own transactions" ON public.platform_wallet_transactions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.platform_wallets w
            JOIN public.platform_users u ON w.platform_user_id = u.id
            WHERE w.id = platform_wallet_transactions.wallet_id
            AND u.external_user_id = auth.uid()::uuid
        )
    );

-- Allow admins to see everything
CREATE POLICY "Admins can view all transactions" ON public.platform_wallet_transactions
    FOR ALL
    USING (is_platform_admin());
