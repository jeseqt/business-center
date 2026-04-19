-- Migration ID: 20260419000002_fix_auth_trigger_notice
-- Description: Fix RAISE EXCEPTION to RAISE NOTICE so fallback actually works.

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
    v_wallet_id uuid;
BEGIN
    -- 1. Get App ID from metadata
    v_app_slug := new.raw_user_meta_data->>'app_slug';
    
    IF v_app_slug IS NOT NULL AND v_app_slug != '' THEN
        SELECT id INTO v_app_id FROM public.platform_apps WHERE slug = v_app_slug LIMIT 1;
        IF v_app_id IS NULL THEN
            RAISE NOTICE 'Invalid app_slug provided: %', v_app_slug;
        END IF;
    END IF;

    IF v_app_id IS NULL THEN
        BEGIN
            v_input_app_id := (new.raw_user_meta_data->>'app_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_input_app_id := NULL;
        END;

        IF v_input_app_id IS NOT NULL THEN
            SELECT id INTO v_app_id FROM public.platform_apps WHERE id = v_input_app_id LIMIT 1;
            IF v_app_id IS NULL THEN
                RAISE NOTICE 'Invalid app_id provided: %', v_input_app_id;
            END IF;
        END IF;
    END IF;

    -- 2. Validate App ID or use fallback (恢复的逻辑)
    IF v_app_id IS NULL THEN
        -- Fallback to the first active app
        SELECT id INTO v_app_id FROM public.platform_apps WHERE status = 'active' ORDER BY created_at ASC LIMIT 1;
        
        IF v_app_id IS NULL THEN
            -- If still no app, fallback to ANY app
            SELECT id INTO v_app_id FROM public.platform_apps ORDER BY created_at ASC LIMIT 1;
        END IF;

        IF v_app_id IS NULL THEN
            RAISE EXCEPTION 'Registration requires a valid app_slug or app_id in user_metadata, and no fallback app is available in the system.';
        END IF;
    END IF;

    -- 3. Ensure global wallet exists
    INSERT INTO public.platform_wallets (user_id, balance_permanent, balance_temporary)
    VALUES (new.id::uuid, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT id INTO v_wallet_id FROM public.platform_wallets WHERE user_id = new.id::uuid LIMIT 1;

    -- 4. Check for existing user by email
    SELECT id INTO v_existing_user_id
    FROM public.platform_users
    WHERE email = new.email
    LIMIT 1;

    IF v_existing_user_id IS NOT NULL THEN
        v_target_user_id := v_existing_user_id;

        UPDATE public.platform_users
        SET external_user_id = new.id::uuid,
            email = new.email,
            last_active_at = now(),
            wallet_id = v_wallet_id
        WHERE id = v_existing_user_id;
        
        INSERT INTO public.platform_user_bindings (platform_user_id, app_id, external_user_id, identity_type)
        VALUES (v_existing_user_id, v_app_id, new.id::text, 'auth_user_id')
        ON CONFLICT (app_id, external_user_id, identity_type) DO NOTHING;
        
    ELSE
        v_target_user_id := new.id;

        INSERT INTO public.platform_users (
            id,
            app_id,
            external_user_id,
            email,
            status,
            metadata,
            wallet_id
        ) VALUES (
            new.id,
            v_app_id,
            new.id::uuid,
            new.email,
            'active',
            jsonb_build_object(
                'source', 'auth_trigger',
                'display_name', COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
            ),
            v_wallet_id
        );

        INSERT INTO public.platform_user_bindings (platform_user_id, app_id, external_user_id, identity_type)
        VALUES (new.id, v_app_id, new.id::text, 'auth_user_id')
        ON CONFLICT (app_id, external_user_id, identity_type) DO NOTHING;
    END IF;

    RETURN new;
END;
$$;