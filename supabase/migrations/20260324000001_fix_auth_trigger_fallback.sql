-- 20260324000001_fix_auth_trigger_fallback.sql
-- 目的：修复当注册时 user_metadata 中未提供 app_slug 或 app_id 时，导致 "Database error saving new user" 的错误。
-- 策略：如果没有提供 App 标识，则回退使用系统中第一个状态为 'active' 的应用作为默认 App。

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
            RAISE NOTICE 'Invalid app_slug provided: %', v_app_slug;
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
                RAISE NOTICE 'Invalid app_id provided: %', v_input_app_id;
            END IF;
        END IF;
    END IF;

    -- 2. Validate App ID or use fallback
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

    -- 3. Check for existing user by email
    SELECT id INTO v_existing_user_id
    FROM public.platform_users
    WHERE email = new.email
    LIMIT 1;

    IF v_existing_user_id IS NOT NULL THEN
        v_target_user_id := v_existing_user_id;

        -- A. User exists: Update external_user_id (as UUID)
        UPDATE public.platform_users
        SET external_user_id = new.id::uuid,
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
            new.id::uuid,
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
