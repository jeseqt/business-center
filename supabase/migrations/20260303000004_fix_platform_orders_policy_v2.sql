DROP POLICY IF EXISTS "Users can view own orders" ON public.platform_orders;

CREATE POLICY "Users can view own orders" ON public.platform_orders
    FOR SELECT
    USING (
        platform_user_id::text IN (
            SELECT id::text FROM public.platform_users
            WHERE external_user_id::text = auth.uid()::text
        )
    );
