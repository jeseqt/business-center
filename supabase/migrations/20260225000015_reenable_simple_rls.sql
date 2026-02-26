-- RE-ENABLE RLS WITH SIMPLE POLICIES
-- Purpose: Restore security but keep policies minimal to avoid recursion/timeouts.

-- ==============================================================================
-- 1. Reset platform_users Policies
-- ==============================================================================
ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;

-- Drop any potentially problematic policies
DROP POLICY IF EXISTS "Admins can view users" ON public.platform_users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.platform_users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.platform_users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.platform_users;

-- Create SIMPLE, DIRECT policies
-- 1. View own profile
CREATE POLICY "Users can view own profile" ON public.platform_users
    FOR SELECT USING (external_user_id = auth.uid());

-- 2. Insert own profile
CREATE POLICY "Users can insert own profile" ON public.platform_users
    FOR INSERT WITH CHECK (external_user_id = auth.uid());

-- 3. Update own profile
CREATE POLICY "Users can update own profile" ON public.platform_users
    FOR UPDATE USING (external_user_id = auth.uid());


-- ==============================================================================
-- 2. Reset platform_banners Policies
-- ==============================================================================
ALTER TABLE public.platform_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can read active banners" ON public.platform_banners;

-- Create SIMPLE policy
CREATE POLICY "Everyone can read active banners" ON public.platform_banners
    FOR SELECT USING (is_active = true);


-- ==============================================================================
-- 3. Reset other tables
-- ==============================================================================
ALTER TABLE public.platform_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_profiles ENABLE ROW LEVEL SECURITY;

-- Apps: Active apps visible to authenticated users
DROP POLICY IF EXISTS "Authenticated users can view active apps" ON public.platform_apps;
CREATE POLICY "Authenticated users can view active apps" ON public.platform_apps
    FOR SELECT
    TO authenticated
    USING (status = 'active');

-- Wallets: View own
DROP POLICY IF EXISTS "Users can view own wallet" ON public.platform_wallets;
CREATE POLICY "Users can view own wallet" ON public.platform_wallets
    FOR SELECT USING (platform_user_id IN (
        SELECT id FROM platform_users WHERE external_user_id = auth.uid()
    ));

-- Transactions: View own
DROP POLICY IF EXISTS "Users can view own transactions" ON public.platform_wallet_transactions;
CREATE POLICY "Users can view own transactions" ON public.platform_wallet_transactions
    FOR SELECT USING (wallet_id IN (
        SELECT id FROM platform_wallets WHERE platform_user_id IN (
            SELECT id FROM platform_users WHERE external_user_id = auth.uid()
        )
    ));
