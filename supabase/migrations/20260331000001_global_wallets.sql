-- Migration ID: 20260331000001_global_wallets
-- Description: Convert platform_wallets to be shared globally per user account (Auth ID), while keeping transaction records app-aware.

-- 1. Add app_id to platform_wallet_transactions
ALTER TABLE public.platform_wallet_transactions ADD COLUMN app_id uuid REFERENCES public.platform_apps(id);

-- Backfill app_id for existing transactions from platform_wallets
UPDATE public.platform_wallet_transactions t
SET app_id = w.app_id
FROM public.platform_wallets w
WHERE t.wallet_id = w.id;

-- 2. Add user_id to platform_wallets
ALTER TABLE public.platform_wallets ADD COLUMN user_id uuid;

-- Backfill user_id from platform_users
UPDATE public.platform_wallets w
SET user_id = u.external_user_id::uuid
FROM public.platform_users u
WHERE w.platform_user_id = u.id;

-- 3. Deduplicate wallets (keep one per user_id)
-- Create temp table to hold rankings
CREATE TEMP TABLE tmp_ranked_wallets AS
SELECT id, user_id, balance_permanent, balance_temporary,
       ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY updated_at ASC) as rn
FROM public.platform_wallets
WHERE user_id IS NOT NULL;

-- Move transactions to primary wallet
UPDATE public.platform_wallet_transactions t
SET wallet_id = p.id
FROM tmp_ranked_wallets s
JOIN tmp_ranked_wallets p ON p.user_id = s.user_id AND p.rn = 1
WHERE t.wallet_id = s.id AND s.rn > 1;

-- Sum balances into primary wallet
UPDATE public.platform_wallets w
SET balance_permanent = w.balance_permanent + agg.sum_perm,
    balance_temporary = w.balance_temporary + agg.sum_temp
FROM (
    SELECT user_id, 
           SUM(balance_permanent) as sum_perm, 
           SUM(balance_temporary) as sum_temp
    FROM tmp_ranked_wallets
    WHERE rn > 1
    GROUP BY user_id
) agg
WHERE w.user_id = agg.user_id AND w.id IN (
    SELECT id FROM tmp_ranked_wallets WHERE rn = 1
);

-- Delete secondary wallets
DELETE FROM public.platform_wallets 
WHERE id IN (
    SELECT id FROM tmp_ranked_wallets WHERE rn > 1
);

DROP TABLE tmp_ranked_wallets;

-- 4. Make platform_wallets user_id unique and not null
ALTER TABLE public.platform_wallets DROP CONSTRAINT IF EXISTS platform_wallets_app_id_platform_user_id_key;
ALTER TABLE public.platform_wallets DROP COLUMN app_id CASCADE;
ALTER TABLE public.platform_wallets DROP COLUMN platform_user_id CASCADE;

ALTER TABLE public.platform_wallets ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.platform_wallets ADD CONSTRAINT platform_wallets_user_id_key UNIQUE (user_id);

-- 5. Link platform_users to platform_wallets
ALTER TABLE public.platform_users ADD COLUMN wallet_id uuid REFERENCES public.platform_wallets(id);

UPDATE public.platform_users u
SET wallet_id = w.id
FROM public.platform_wallets w
WHERE u.external_user_id::uuid = w.user_id;

-- Create index for faster joins
CREATE INDEX IF NOT EXISTS idx_platform_users_wallet_id ON public.platform_users(wallet_id);

-- 6. Update process_wallet_transaction RPC
CREATE OR REPLACE FUNCTION public.process_wallet_transaction(
    _user_id text,          -- Input as text (robust)
    _amount int,            -- Amount (positive for deposit, negative for payment)
    _type text,             -- Transaction type: 'deposit', 'payment', 'refund', 'bonus'
    _app_id uuid DEFAULT NULL, -- App ID (now recorded on the transaction, optional for admin adjustments)
    _order_id uuid DEFAULT NULL, -- Optional associated order ID
    _description text DEFAULT NULL -- Optional description
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_uuid uuid;
    v_wallet_id uuid;
    v_current_balance int;
    v_new_balance int;
    v_transaction_id uuid;
BEGIN
    -- Cast _user_id to uuid
    BEGIN
        v_user_uuid := _user_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid user_id format (expected uuid)');
    END;

    -- 1. Find global wallet and lock row for update
    SELECT id, balance_permanent INTO v_wallet_id, v_current_balance
    FROM public.platform_wallets
    WHERE user_id = v_user_uuid
    FOR UPDATE;

    IF v_wallet_id IS NULL THEN
        -- Auto-create global wallet if missing
        INSERT INTO public.platform_wallets (user_id, balance_permanent, balance_temporary)
        VALUES (v_user_uuid, 0, 0)
        RETURNING id, balance_permanent INTO v_wallet_id, v_current_balance;
        
        -- Also update platform_users to point to this new wallet
        UPDATE public.platform_users SET wallet_id = v_wallet_id WHERE external_user_id = _user_id;
    END IF;

    -- 2. Calculate new balance
    v_new_balance := v_current_balance + _amount;

    -- 3. Check for sufficient funds (only for payments/debits)
    IF _amount < 0 AND v_new_balance < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
    END IF;

    -- 4. Update wallet balance
    UPDATE public.platform_wallets
    SET balance_permanent = v_new_balance,
        updated_at = now(),
        version = version + 1
    WHERE id = v_wallet_id;

    -- 5. Record transaction
    INSERT INTO public.platform_wallet_transactions (
        wallet_id,
        app_id,
        amount,
        balance_after,
        type,
        description,
        metadata
    ) VALUES (
        v_wallet_id,
        _app_id,
        _amount,
        v_new_balance,
        _type,
        _description,
        jsonb_build_object('order_id', _order_id)
    ) RETURNING id INTO v_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance,
        'transaction_id', v_transaction_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 7. Update handle_new_auth_user trigger
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

    IF v_app_id IS NULL THEN
        RAISE EXCEPTION 'Registration requires a valid app_slug or app_id in user_metadata';
    END IF;

    -- 2. Ensure global wallet exists
    INSERT INTO public.platform_wallets (user_id, balance_permanent, balance_temporary)
    VALUES (new.id::uuid, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT id INTO v_wallet_id FROM public.platform_wallets WHERE user_id = new.id::uuid LIMIT 1;

    -- 3. Check for existing user by email
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

-- 8. Update get_or_create_user_dashboard_data
CREATE OR REPLACE FUNCTION public.get_or_create_user_dashboard_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_app_id uuid;
    v_platform_user_id uuid;
    v_platform_user_data jsonb;
    v_wallet_id uuid;
    v_wallet_data jsonb;
    v_transactions jsonb;
    v_result jsonb;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Not authenticated');
    END IF;

    SELECT id INTO v_platform_user_id
    FROM public.platform_users
    WHERE external_user_id = v_user_id
    LIMIT 1;

    IF v_platform_user_id IS NULL THEN
        SELECT id INTO v_app_id FROM public.platform_apps WHERE slug = 'business-center' LIMIT 1;
        IF v_app_id IS NULL THEN
            SELECT id INTO v_app_id FROM public.platform_apps WHERE status = 'active' ORDER BY created_at ASC LIMIT 1;
        END IF;
        IF v_app_id IS NULL THEN
            SELECT id INTO v_app_id FROM public.platform_apps LIMIT 1;
        END IF;
        IF v_app_id IS NULL THEN
            RETURN jsonb_build_object('error', 'No platform apps configured');
        END IF;

        INSERT INTO public.platform_wallets (user_id, balance_permanent, balance_temporary)
        VALUES (v_user_id, 0, 0)
        ON CONFLICT (user_id) DO NOTHING;

        SELECT id INTO v_wallet_id FROM public.platform_wallets WHERE user_id = v_user_id LIMIT 1;

        INSERT INTO public.platform_users (
            external_user_id, app_id, status, metadata, wallet_id
        ) VALUES (
            v_user_id, v_app_id, 'active', jsonb_build_object('source', 'rpc_auto_create'), v_wallet_id
        )
        ON CONFLICT (app_id, external_user_id) DO NOTHING
        RETURNING id INTO v_platform_user_id;

        IF v_platform_user_id IS NULL THEN
            SELECT id INTO v_platform_user_id FROM public.platform_users WHERE external_user_id = v_user_id LIMIT 1;
        END IF;
    END IF;

    SELECT row_to_json(u) INTO v_platform_user_data FROM public.platform_users u WHERE id = v_platform_user_id;

    SELECT id INTO v_wallet_id FROM public.platform_wallets WHERE user_id = v_user_id LIMIT 1;

    IF v_wallet_id IS NULL THEN
        INSERT INTO public.platform_wallets (user_id, balance_permanent, balance_temporary)
        VALUES (v_user_id, 0, 0)
        RETURNING id INTO v_wallet_id;
        
        UPDATE public.platform_users SET wallet_id = v_wallet_id WHERE external_user_id = v_user_id;
    END IF;

    SELECT row_to_json(w) INTO v_wallet_data FROM public.platform_wallets w WHERE id = v_wallet_id;

    SELECT COALESCE(jsonb_agg(t ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_transactions
    FROM (
        SELECT * FROM public.platform_wallet_transactions
        WHERE wallet_id = v_wallet_id
        ORDER BY created_at DESC
        LIMIT 5
    ) t;

    v_result := jsonb_build_object(
        'platform_user', v_platform_user_data,
        'wallet', v_wallet_data,
        'transactions', v_transactions
    );

    RETURN v_result;
END;
$$;
