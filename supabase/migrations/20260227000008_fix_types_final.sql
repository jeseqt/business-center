-- Migration ID: 20260227000008_fix_types_final
-- Description: Comprehensive fix for type mismatches (UUID vs TEXT) in platform_users, triggers, RPC, and RLS.

-- ==============================================================================
-- 1. Fix Trigger: handle_new_auth_user (Ensure UUID insertion into platform_users)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_app_id uuid;
    v_app_slug text;
    v_input_app_id uuid;
    v_existing_user_id uuid;
    v_target_user_id uuid;
BEGIN
    -- 1. Get App ID from metadata
    v_app_slug := new.raw_user_meta_data->>'app_slug';
    
    IF v_app_slug IS NOT NULL THEN
        SELECT id INTO v_app_id FROM public.platform_apps WHERE slug = v_app_slug LIMIT 1;
        IF v_app_id IS NULL THEN
            RAISE EXCEPTION 'Invalid app_slug provided: %', v_app_slug;
        END IF;
    ELSE
        BEGIN
            v_input_app_id := (new.raw_user_meta_data->>'app_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_input_app_id := NULL;
        END;

        IF v_input_app_id IS NOT NULL THEN
            SELECT id INTO v_app_id FROM public.platform_apps WHERE id = v_input_app_id LIMIT 1;
            IF v_app_id IS NULL THEN
                RAISE EXCEPTION 'Invalid app_id provided: %', v_input_app_id;
            END IF;
        END IF;
    END IF;

    -- 2. Validate App ID
    IF v_app_id IS NULL THEN
        RAISE EXCEPTION 'Registration requires a valid app_slug or app_id in user_metadata';
    END IF;

    -- 3. Check for existing user by email
    SELECT id INTO v_existing_user_id
    FROM public.platform_users
    WHERE email = new.email
    LIMIT 1;

    IF v_existing_user_id IS NOT NULL THEN
        v_target_user_id := v_existing_user_id;

        -- A. User exists: Update external_user_id (as UUID)
        UPDATE public.platform_users
        SET external_user_id = new.id::uuid, -- Fix: Explicitly cast to UUID
            email = new.email,
            last_active_at = now()
        WHERE id = v_existing_user_id;
        
        -- Bind to auth_user_id (as TEXT in bindings table)
        INSERT INTO public.platform_user_bindings (platform_user_id, app_id, external_user_id, identity_type)
        VALUES (v_existing_user_id, v_app_id, new.id::text, 'auth_user_id')
        ON CONFLICT (app_id, external_user_id, identity_type) DO NOTHING;
        
    ELSE
        v_target_user_id := new.id;

        -- B. User not exists: Create new user (as UUID)
        INSERT INTO public.platform_users (
            id,
            app_id,
            external_user_id, -- UUID column
            email,
            status,
            metadata
        ) VALUES (
            new.id,
            v_app_id,
            new.id::uuid, -- Fix: Explicitly cast to UUID
            new.email,
            'active',
            jsonb_build_object(
                'source', 'auth_trigger',
                'display_name', COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
            )
        );

        INSERT INTO public.platform_user_bindings (platform_user_id, app_id, external_user_id, identity_type)
        VALUES (new.id, v_app_id, new.id::text, 'auth_user_id')
        ON CONFLICT (app_id, external_user_id, identity_type) DO NOTHING;
    END IF;

    -- 4. Auto-create wallet
    INSERT INTO public.platform_wallets (app_id, platform_user_id, balance_permanent)
    VALUES (v_app_id, v_target_user_id, 0)
    ON CONFLICT (app_id, platform_user_id) DO NOTHING;

    RETURN new;
END;
$$;

-- ==============================================================================
-- 2. Fix RPC: get_or_create_user_dashboard_data (Ensure UUID usage)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_user_dashboard_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_external_user_id uuid; -- Correct: UUID
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
    
    -- Assign UUID directly
    v_external_user_id := v_user_id;

    -- 2. Try to find existing platform_user ID only first (faster)
    SELECT id INTO v_platform_user_id
    FROM public.platform_users
    WHERE external_user_id = v_external_user_id -- UUID = UUID
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
                v_external_user_id, -- UUID
                v_app_id,
                'active',
                jsonb_build_object('source', 'rpc_auto_create')
            )
            RETURNING id INTO v_platform_user_id;
        EXCEPTION WHEN unique_violation THEN
            -- Handle race condition where user was created concurrently
            SELECT id INTO v_platform_user_id
            FROM public.platform_users
            WHERE external_user_id = v_external_user_id -- UUID = UUID
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

-- ==============================================================================
-- 3. Fix RLS Policies (Ensure UUID comparisons)
-- ==============================================================================

-- platform_users
DROP POLICY IF EXISTS "Users can view own profile" ON public.platform_users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.platform_users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.platform_users;

CREATE POLICY "Users can view own profile" ON public.platform_users
    FOR SELECT USING (external_user_id = auth.uid()::uuid); -- UUID = UUID

CREATE POLICY "Users can insert own profile" ON public.platform_users
    FOR INSERT WITH CHECK (external_user_id = auth.uid()::uuid);

CREATE POLICY "Users can update own profile" ON public.platform_users
    FOR UPDATE USING (external_user_id = auth.uid()::uuid);

-- platform_wallets
DROP POLICY IF EXISTS "Users can view own wallet" ON public.platform_wallets;

CREATE POLICY "Users can view own wallet" ON public.platform_wallets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.platform_users
            WHERE id = platform_wallets.platform_user_id
            AND external_user_id = auth.uid()::uuid -- UUID = UUID
        )
    );

-- platform_wallet_transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON public.platform_wallet_transactions;

CREATE POLICY "Users can view own transactions" ON public.platform_wallet_transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.platform_wallets
            JOIN public.platform_users ON platform_users.id = platform_wallets.platform_user_id
            WHERE platform_wallets.id = platform_wallet_transactions.wallet_id
            AND platform_users.external_user_id = auth.uid()::uuid -- UUID = UUID
        )
    );
