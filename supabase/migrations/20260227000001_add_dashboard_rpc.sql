-- Migration ID: 20260227000001_add_dashboard_rpc
-- Description: Adds a robust RPC function for dashboard data fetching with auto-creation capabilities.
-- This function uses SECURITY DEFINER to bypass RLS policies and ensure consistent data access.

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
    v_platform_user record;
    v_wallet record;
    v_transactions jsonb;
    v_result jsonb;
BEGIN
    -- 1. Get current Auth User ID
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Not authenticated');
    END IF;
    
    v_external_user_id := v_user_id::text;

    -- 2. Try to find existing platform_user
    SELECT * INTO v_platform_user
    FROM public.platform_users
    WHERE external_user_id = v_external_user_id
    LIMIT 1;

    -- 3. If not found, create one
    IF v_platform_user IS NULL THEN
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
            -- No apps exist at all, return error but don't fail transaction
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
            RETURNING * INTO v_platform_user;
        EXCEPTION WHEN unique_violation THEN
            -- Handle race condition where user was created concurrently
            SELECT * INTO v_platform_user
            FROM public.platform_users
            WHERE external_user_id = v_external_user_id
            LIMIT 1;
        END;
    END IF;

    -- 4. Try to find wallet
    SELECT * INTO v_wallet
    FROM public.platform_wallets
    WHERE platform_user_id = v_platform_user.id
    LIMIT 1;

    -- 5. If not found, create wallet
    IF v_wallet IS NULL THEN
        BEGIN
            INSERT INTO public.platform_wallets (
                app_id,
                platform_user_id,
                balance_permanent,
                balance_temporary
            ) VALUES (
                v_platform_user.app_id,
                v_platform_user.id,
                0,
                0
            )
            RETURNING * INTO v_wallet;
        EXCEPTION WHEN unique_violation THEN
            -- Handle race condition
            SELECT * INTO v_wallet
            FROM public.platform_wallets
            WHERE platform_user_id = v_platform_user.id
            LIMIT 1;
        END;
    END IF;

    -- 6. Fetch recent transactions
    SELECT COALESCE(jsonb_agg(t ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_transactions
    FROM (
        SELECT *
        FROM public.platform_wallet_transactions
        WHERE wallet_id = v_wallet.id
        ORDER BY created_at DESC
        LIMIT 5
    ) t;

    -- 7. Build result
    v_result := jsonb_build_object(
        'platform_user', row_to_json(v_platform_user),
        'wallet', row_to_json(v_wallet),
        'transactions', v_transactions
    );

    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    -- Catch-all for unexpected errors to prevent client crashes
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;
