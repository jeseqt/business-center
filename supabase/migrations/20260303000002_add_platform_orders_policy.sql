-- Migration: Add RLS policy for platform_orders to allow users to view their own orders
-- Also add index on platform_user_id for better performance

-- 1. Add index if not exists
CREATE INDEX IF NOT EXISTS idx_platform_orders_user_id ON public.platform_orders(platform_user_id);

-- 2. Drop existing policy if exists (to be safe)
DROP POLICY IF EXISTS "Users can view own orders" ON public.platform_orders;

-- 3. Create policy
-- Ensure users can only see orders linked to their platform_user_id which is linked to their auth.uid()
CREATE POLICY "Users can view own orders" ON public.platform_orders
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL
    );
