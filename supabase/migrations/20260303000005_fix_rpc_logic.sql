CREATE OR REPLACE FUNCTION public.get_user_product_purchase_count(
    _app_id uuid,
    _product_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count int;
BEGIN
    -- Check if user is authenticated
    IF auth.uid() IS NULL THEN
        RETURN 0;
    END IF;

    SELECT count(*)
    INTO v_count
    FROM public.platform_orders o
    JOIN public.platform_users u ON o.platform_user_id = u.id
    WHERE u.external_user_id = auth.uid()::text
    AND o.app_id = _app_id
    AND o.status = 'paid'
    AND (o.metadata->>'product_id')::uuid = _product_id;

    RETURN v_count;
END;
$$;
