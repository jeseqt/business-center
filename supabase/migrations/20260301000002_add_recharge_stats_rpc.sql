-- Create RPC to get recharge statistics
CREATE OR REPLACE FUNCTION public.get_recharge_stats(
    _app_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_recharge bigint;
    v_month_recharge bigint;
    v_today_recharge bigint;
    v_total_orders bigint;
BEGIN
    -- 1. Total Recharge Amount (All time)
    SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO v_total_recharge, v_total_orders
    FROM public.platform_orders
    WHERE status = 'paid'
    AND (_app_id IS NULL OR app_id = _app_id)
    -- Filter for recharge orders specifically
    -- We assume 'bagelpay' channel is strictly for recharge based on current implementation
    -- Also check metadata for legacy/future compatibility
    AND (channel = 'bagelpay' OR metadata ? 'recharge_amount_usd');

    -- 2. This Month Recharge
    SELECT COALESCE(SUM(amount), 0)
    INTO v_month_recharge
    FROM public.platform_orders
    WHERE status = 'paid'
    AND (_app_id IS NULL OR app_id = _app_id)
    AND (channel = 'bagelpay' OR metadata ? 'recharge_amount_usd')
    AND paid_at >= date_trunc('month', now());

    -- 3. Today Recharge
    SELECT COALESCE(SUM(amount), 0)
    INTO v_today_recharge
    FROM public.platform_orders
    WHERE status = 'paid'
    AND (_app_id IS NULL OR app_id = _app_id)
    AND (channel = 'bagelpay' OR metadata ? 'recharge_amount_usd')
    AND paid_at >= date_trunc('day', now());

    RETURN jsonb_build_object(
        'total_amount', v_total_recharge,
        'month_amount', v_month_recharge,
        'today_amount', v_today_recharge,
        'total_count', v_total_orders
    );
END;
$$;
