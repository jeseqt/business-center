-- Migration ID: 20260227000010_optimize_rpc_final_v2
-- Description: Removes costly BEGIN/EXCEPTION blocks, uses ON CONFLICT instead, and ensures indexes are optimized.
--              Critically, fixes UUID vs TEXT type mismatch in external_user_id comparison.

-- ==============================================================================
-- 1. Ensure indexes for performance (Idempotent)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_platform_users_external_user_id ON public.platform_users(external_user_id);
CREATE INDEX IF NOT EXISTS idx_platform_wallets_platform_user_id ON public.platform_wallets(platform_user_id);
CREATE INDEX IF NOT EXISTS idx_platform_wallet_transactions_wallet_id ON public.platform_wallet_transactions(wallet_id);

-- ==============================================================================
-- 2. Optimize RPC: get_or_create_user_dashboard_data
--    - Explicit type casting for external_user_id (UUID -> TEXT)
--    - Use ON CONFLICT DO NOTHING instead of exception handling (faster)
--    - Minimize lock contention
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_user_dashboard_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_user_id_text text; -- Explicit text variable for index usage
    v_app_id uuid;
    v_platform_user_id uuid;
    v_platform_user_data jsonb;
    v_wallet_id uuid;
    v_wallet_data jsonb;
    v_transactions jsonb;
    v_result jsonb;
BEGIN
    -- 1. Get current Auth User ID
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Not authenticated');
    END IF;

    -- Convert to text explicitly for index matching
    v_user_id_text := v_user_id::text;

    -- 2. Try to find existing platform_user ID (Fastest path)
    SELECT id INTO v_platform_user_id
    FROM public.platform_users
    WHERE external_user_id = v_user_id_text
    LIMIT 1;

    -- 3. If not found, create one
    IF v_platform_user_id IS NULL THEN
        -- Find default app (prioritize active ones)
        -- Optimization: Hardcode 'business-center' slug check first as it's most common
        SELECT id INTO v_app_id
        FROM public.platform_apps
        WHERE slug = 'business-center'
        LIMIT 1;

        IF v_app_id IS NULL THEN
            SELECT id INTO v_app_id
            FROM public.platform_apps
            WHERE status = 'active'
            ORDER BY created_at ASC
            LIMIT 1;
        END IF;

        -- Fallback to any app if no active ones found
        IF v_app_id IS NULL THEN
            SELECT id INTO v_app_id
            FROM public.platform_apps
            LIMIT 1;
        END IF;

        IF v_app_id IS NULL THEN
            RETURN jsonb_build_object('error', 'No platform apps configured');
        END IF;

        -- Create user safely with ON CONFLICT
        INSERT INTO public.platform_users (
            external_user_id,
            app_id,
            status,
            metadata
        ) VALUES (
            v_user_id_text,
            v_app_id,
            'active',
            jsonb_build_object('source', 'rpc_auto_create')
        )
        ON CONFLICT (app_id, external_user_id) DO NOTHING
        RETURNING id INTO v_platform_user_id;

        -- If INSERT returned NULL (due to conflict), select again
        IF v_platform_user_id IS NULL THEN
            SELECT id INTO v_platform_user_id
            FROM public.platform_users
            WHERE external_user_id = v_user_id_text
            LIMIT 1;
        END IF;
    END IF;

    -- Fetch full user data for return
    SELECT row_to_json(u) INTO v_platform_user_data
    FROM public.platform_users u
    WHERE id = v_platform_user_id;

    -- 4. Try to find wallet
    SELECT id INTO v_wallet_id
    FROM public.platform_wallets
    WHERE platform_user_id = v_platform_user_id
    LIMIT 1;

    -- 5. If not found, create wallet
    IF v_wallet_id IS NULL THEN
        -- Get app_id from user data if not already set
        IF v_app_id IS NULL THEN
            v_app_id := (v_platform_user_data->>'app_id')::uuid;
        END IF;

        INSERT INTO public.platform_wallets (
            app_id,
            platform_user_id,
            balance_permanent,
            balance_temporary
        ) VALUES (
            v_app_id,
            v_platform_user_id,
            0,
            0
        )
        ON CONFLICT (app_id, platform_user_id) DO NOTHING
        RETURNING id INTO v_wallet_id;

        -- If INSERT returned NULL (due to conflict), select again
        IF v_wallet_id IS NULL THEN
            SELECT id INTO v_wallet_id
            FROM public.platform_wallets
            WHERE platform_user_id = v_platform_user_id
            LIMIT 1;
        END IF;
    END IF;

    -- Fetch wallet data
    SELECT row_to_json(w) INTO v_wallet_data
    FROM public.platform_wallets w
    WHERE id = v_wallet_id;

    -- 6. Fetch recent transactions (Optimized with LIMIT)
    SELECT COALESCE(jsonb_agg(t ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_transactions
    FROM (
        SELECT *
        FROM public.platform_wallet_transactions
        WHERE wallet_id = v_wallet_id
        ORDER BY created_at DESC
        LIMIT 5
    ) t;

    -- 7. Build result
    v_result := jsonb_build_object(
        'platform_user', v_platform_user_data,
        'wallet', v_wallet_data,
        'transactions', v_transactions
    );

    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    -- Catch-all for unexpected errors
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;
