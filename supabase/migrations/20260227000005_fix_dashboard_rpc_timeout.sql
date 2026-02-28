-- Migration ID: 20260227000003_fix_dashboard_rpc_timeout
-- Description: Re-creates the dashboard RPC with optimized logic and ensures indexes exist.

-- 1. Ensure indexes exist for performance
CREATE INDEX IF NOT EXISTS idx_platform_users_external_user_id ON public.platform_users(external_user_id);
CREATE INDEX IF NOT EXISTS idx_platform_wallets_platform_user_id ON public.platform_wallets(platform_user_id);
CREATE INDEX IF NOT EXISTS idx_platform_wallet_transactions_wallet_id ON public.platform_wallet_transactions(wallet_id);

-- 2. Re-create the RPC function with strict error handling and no complex dependencies
CREATE OR REPLACE FUNCTION public.get_or_create_user_dashboard_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_external_user_id text;
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
    
    v_external_user_id := v_user_id::text;

    -- 2. Try to find existing platform_user ID only first (faster)
    SELECT id INTO v_platform_user_id
    FROM public.platform_users
    WHERE external_user_id = v_external_user_id
    LIMIT 1;

    -- 3. If not found, create one
    IF v_platform_user_id IS NULL THEN
        -- Find default app (prioritize active ones)
        SELECT id INTO v_app_id
        FROM public.platform_apps
        WHERE status = 'active'
        ORDER BY created_at ASC
        LIMIT 1;

        -- Fallback to any app if no active ones found
        IF v_app_id IS NULL THEN
            SELECT id INTO v_app_id
            FROM public.platform_apps
            LIMIT 1;
        END IF;

        IF v_app_id IS NULL THEN
            RETURN jsonb_build_object('error', 'No platform apps configured');
        END IF;

        -- Create user safely
        BEGIN
            INSERT INTO public.platform_users (
                external_user_id,
                app_id,
                status,
                metadata
            ) VALUES (
                v_external_user_id,
                v_app_id,
                'active',
                jsonb_build_object('source', 'rpc_auto_create')
            )
            RETURNING id INTO v_platform_user_id;
        EXCEPTION WHEN unique_violation THEN
            -- Handle race condition where user was created concurrently
            SELECT id INTO v_platform_user_id
            FROM public.platform_users
            WHERE external_user_id = v_external_user_id
            LIMIT 1;
        END;
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

        BEGIN
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
            RETURNING id INTO v_wallet_id;
        EXCEPTION WHEN unique_violation THEN
            -- Handle race condition
            SELECT id INTO v_wallet_id
            FROM public.platform_wallets
            WHERE platform_user_id = v_platform_user_id
            LIMIT 1;
        END;
    END IF;

    -- Fetch wallet data
    SELECT row_to_json(w) INTO v_wallet_data
    FROM public.platform_wallets w
    WHERE id = v_wallet_id;

    -- 6. Fetch recent transactions
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
