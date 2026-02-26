-- 20260226000002_add_admin_data_permissions.sql
-- Restore admin access to core tables after RLS simplification

-- 1. Platform Users
-- Check if policy exists before creating (or drop if exists to be safe)
DROP POLICY IF EXISTS "Admins can view all users" ON public.platform_users;
CREATE POLICY "Admins can view all users" ON public.platform_users
    FOR SELECT USING (is_platform_admin());

DROP POLICY IF EXISTS "Admins can update users" ON public.platform_users;
CREATE POLICY "Admins can update users" ON public.platform_users
    FOR UPDATE USING (is_platform_admin());

-- 2. Platform Wallets
DROP POLICY IF EXISTS "Admins can view all wallets" ON public.platform_wallets;
CREATE POLICY "Admins can view all wallets" ON public.platform_wallets
    FOR SELECT USING (is_platform_admin());

DROP POLICY IF EXISTS "Admins can update wallets" ON public.platform_wallets;
CREATE POLICY "Admins can update wallets" ON public.platform_wallets
    FOR UPDATE USING (is_platform_admin());

-- 3. Platform Wallet Transactions
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.platform_wallet_transactions;
CREATE POLICY "Admins can view all transactions" ON public.platform_wallet_transactions
    FOR SELECT USING (is_platform_admin());

-- 4. Platform Apps
-- Note: 'Authenticated users can view active apps' exists. Admins need to see all.
DROP POLICY IF EXISTS "Admins can view all apps" ON public.platform_apps;
CREATE POLICY "Admins can view all apps" ON public.platform_apps
    FOR SELECT USING (is_platform_admin());

DROP POLICY IF EXISTS "Admins can update apps" ON public.platform_apps;
CREATE POLICY "Admins can update apps" ON public.platform_apps
    FOR UPDATE USING (is_platform_admin());
    
DROP POLICY IF EXISTS "Admins can insert apps" ON public.platform_apps;
CREATE POLICY "Admins can insert apps" ON public.platform_apps
    FOR INSERT WITH CHECK (is_platform_admin());

-- 5. Platform Banners
DROP POLICY IF EXISTS "Admins can manage banners" ON public.platform_banners;
CREATE POLICY "Admins can manage banners" ON public.platform_banners
    FOR ALL USING (is_platform_admin());

-- 6. Platform Token Usage (Just in case it was lost or needs refresh)
DROP POLICY IF EXISTS "Admins can view token usage" ON public.platform_token_usage;
CREATE POLICY "Admins can view token usage" ON public.platform_token_usage
    FOR SELECT USING (is_platform_admin());

-- 7. Platform Orders
DROP POLICY IF EXISTS "Admins can view orders" ON public.platform_orders;
CREATE POLICY "Admins can view orders" ON public.platform_orders
    FOR SELECT USING (is_platform_admin());
