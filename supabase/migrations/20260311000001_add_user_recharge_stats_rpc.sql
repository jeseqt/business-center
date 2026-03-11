-- Create RPC to get user-specific recharge statistics
CREATE OR REPLACE FUNCTION public.get_user_recharge_stats(
    _app_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_amount bigint;
    v_recent_amount bigint;
    v_seven_days_ago timestamp;
    v_user_id uuid;
BEGIN
    -- Check if user is authenticated
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'total_amount', 0, 
            'recent_amount', 0,
            'recent_count', 0
        );
    END IF;

    v_seven_days_ago := now() - interval '7 days';

    -- 1. Calculate total lifetime recharge for this user in this app
    -- Note: We join platform_users to map auth.uid() -> platform_user_id
    SELECT COALESCE(SUM(o.amount), 0)
    INTO v_total_amount
    FROM public.platform_orders o
    JOIN public.platform_users u ON o.platform_user_id = u.id
    WHERE u.external_user_id = v_user_id::text
    AND o.app_id = _app_id
    AND o.status = 'paid';

    -- 2. Calculate recent (last 7 days) recharge amount
    SELECT COALESCE(SUM(o.amount), 0)
    INTO v_recent_amount
    FROM public.platform_orders o
    JOIN public.platform_users u ON o.platform_user_id = u.id
    WHERE u.external_user_id = v_user_id::text
    AND o.app_id = _app_id
    AND o.status = 'paid'
    AND o.created_at >= v_seven_days_ago;

    RETURN jsonb_build_object(
        'total_amount', v_total_amount,
        'recent_amount', v_recent_amount
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_recharge_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_recharge_stats(uuid) TO service_role;
