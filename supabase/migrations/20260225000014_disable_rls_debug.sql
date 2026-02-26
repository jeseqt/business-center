-- NUCLEAR OPTION: Drop ALL policies and DISABLE RLS to fix timeouts
-- Purpose: Temporarily disable RLS to rule out policy recursion and verify data loading.

DO $$ 
DECLARE 
    pol record; 
BEGIN 
    -- Iterate over all policies for the relevant tables in public schema
    FOR pol IN 
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename IN ('platform_users', 'platform_banners', 'platform_apps', 'platform_wallets', 'platform_wallet_transactions', 'platform_admin_profiles') 
    LOOP 
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename); 
    END LOOP; 
END $$;

-- Disable RLS on all relevant tables
ALTER TABLE public.platform_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_banners DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_apps DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_wallets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_wallet_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_profiles DISABLE ROW LEVEL SECURITY;
