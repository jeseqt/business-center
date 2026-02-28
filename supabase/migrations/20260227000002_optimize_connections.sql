-- Migration ID: 20260227000002_optimize_connections
-- Description: Optimizes critical functions to prevent RLS recursion and connection deadlocks.
-- Also attempts to terminate idle connections to clear any existing deadlocks.

-- 1. Recreate is_platform_admin with explicit SECURITY DEFINER and search_path
-- This ensures it bypasses any RLS on platform_admin_profiles itself, preventing recursion.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Direct check using exists, bypassing RLS due to SECURITY DEFINER
  RETURN EXISTS (
    SELECT 1 
    FROM public.platform_admin_profiles
    WHERE id = auth.uid()
  );
END;
$$;

-- 2. Optimize platform_apps RLS
-- Ensure authenticated users can always read active apps without triggering admin checks
DROP POLICY IF EXISTS "Authenticated users can view active apps" ON public.platform_apps;
CREATE POLICY "Authenticated users can view active apps" ON public.platform_apps
    FOR SELECT
    TO authenticated
    USING (status = 'active');

-- 3. Optimize platform_users RLS
-- Ensure users can read their own profile without triggering admin checks
-- (This might be redundant but safe)
DROP POLICY IF EXISTS "Users can view own profile" ON public.platform_users;
CREATE POLICY "Users can view own profile" ON public.platform_users
    FOR SELECT
    USING (external_user_id = auth.uid()::uuid);

-- 4. Create a helper to check connection health (for frontend ping)
CREATE OR REPLACE FUNCTION public.ping()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 'pong';
$$;

-- 5. Attempt to terminate idle connections (Requires superuser, might fail if not)
-- We wrap it in a DO block to ignore errors if permissions are insufficient
DO $$
BEGIN
    -- Only terminate idle connections that are not the current one
    PERFORM pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE state = 'idle' 
    AND pid <> pg_backend_pid()
    AND datname = current_database();
EXCEPTION WHEN OTHERS THEN
    -- Ignore permission errors
    RAISE NOTICE 'Could not terminate idle connections: %', SQLERRM;
END $$;
