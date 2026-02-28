-- Migration ID: 20260227000013_analyze_perf_v2
-- Description: Adds analyze_rpc_perf function with full coverage

CREATE OR REPLACE FUNCTION public.analyze_rpc_perf()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_plan_user jsonb;
    v_plan_wallet jsonb;
    v_plan_tx jsonb;
    v_user_id uuid;
    v_platform_user_id uuid;
    v_wallet_id uuid;
BEGIN
    v_user_id := auth.uid();
    -- Use specific user if auth.uid() is null
    IF v_user_id IS NULL THEN
        SELECT external_user_id INTO v_user_id FROM public.platform_users LIMIT 1;
    END IF;

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'No users found to test');
    END IF;

    -- 1. Analyze User Query
    EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) SELECT id FROM public.platform_users WHERE external_user_id = $1 LIMIT 1'
    INTO v_plan_user
    USING v_user_id;

    -- Get the ID for next steps
    SELECT id INTO v_platform_user_id FROM public.platform_users WHERE external_user_id = v_user_id LIMIT 1;

    IF v_platform_user_id IS NOT NULL THEN
        -- 2. Analyze Wallet Query
        EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) SELECT id FROM public.platform_wallets WHERE platform_user_id = $1 LIMIT 1'
        INTO v_plan_wallet
        USING v_platform_user_id;

        -- Get Wallet ID
        SELECT id INTO v_wallet_id FROM public.platform_wallets WHERE platform_user_id = v_platform_user_id LIMIT 1;

        IF v_wallet_id IS NOT NULL THEN
            -- 3. Analyze Transactions Query
            EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM public.platform_wallet_transactions WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 5'
            INTO v_plan_tx
            USING v_wallet_id;
        END IF;
    END IF;
    
    RETURN jsonb_build_object(
        'plan_user', v_plan_user,
        'plan_wallet', v_plan_wallet,
        'plan_tx', v_plan_tx,
        'tested_user_id', v_user_id
    );
END;
$$;
