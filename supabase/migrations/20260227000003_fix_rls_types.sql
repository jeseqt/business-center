-- Migration ID: 20260227000003_fix_rls_types
-- Description: Fixes type mismatch (UUID vs TEXT) in RLS policies for platform_users and related tables.
-- Also ensures RPC functions are SECURITY DEFINER to bypass RLS where appropriate.

-- ==============================================================================
-- 1. Fix platform_users Policies
-- ==============================================================================

-- Drop existing potential buggy policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.platform_users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.platform_users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.platform_users;

-- Recreate with explicit type casting ::uuid for auth.uid()
CREATE POLICY "Users can view own profile" ON public.platform_users
    FOR SELECT USING (external_user_id = auth.uid()::uuid);

CREATE POLICY "Users can insert own profile" ON public.platform_users
    FOR INSERT WITH CHECK (external_user_id = auth.uid()::uuid);

CREATE POLICY "Users can update own profile" ON public.platform_users
    FOR UPDATE USING (external_user_id = auth.uid()::uuid);

-- ==============================================================================
-- 2. Fix platform_wallets Policies
-- ==============================================================================

DROP POLICY IF EXISTS "Users can view own wallet" ON public.platform_wallets;

CREATE POLICY "Users can view own wallet" ON public.platform_wallets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.platform_users
            WHERE id = platform_wallets.platform_user_id
            AND external_user_id = auth.uid()::uuid  -- Fix: Cast to UUID
        )
    );

-- ==============================================================================
-- 3. Fix platform_wallet_transactions Policies
-- ==============================================================================

DROP POLICY IF EXISTS "Users can view own transactions" ON public.platform_wallet_transactions;

CREATE POLICY "Users can view own transactions" ON public.platform_wallet_transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.platform_wallets
            JOIN public.platform_users ON platform_users.id = platform_wallets.platform_user_id
            WHERE platform_wallets.id = platform_wallet_transactions.wallet_id
            AND platform_users.external_user_id = auth.uid()::uuid  -- Fix: Cast to UUID
        )
    );

-- ==============================================================================
-- 4. Re-apply RPC with strict SECURITY DEFINER
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_user_dashboard_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_external_user_id uuid; -- Changed to UUID
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
    
    -- Explicitly cast to UUID (redundant if v_user_id is uuid, but safe)
    v_external_user_id := v_user_id;

    -- 2. Try to find existing platform_user
    SELECT * INTO v_platform_user
    FROM public.platform_users
    WHERE external_user_id = v_external_user_id
    LIMIT 1;

    -- 3. If not found, create one
    IF v_platform_user IS NULL THEN
        -- Find active app
        SELECT id INTO v_app_id FROM public.platform_apps WHERE status = 'active' LIMIT 1;
        
        IF v_app_id IS NULL THEN
             RETURN jsonb_build_object('error', 'No active app found');
        END IF;

        BEGIN
            INSERT INTO public.platform_users (
                app_id, 
                external_user_id, 
                metadata, 
                status
            ) VALUES (
                v_app_id,
                v_external_user_id,
                jsonb_build_object('source', 'rpc_auto_create'),
                'active'
            )
            RETURNING * INTO v_platform_user;
        EXCEPTION WHEN unique_violation THEN
            -- Handle race condition
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
    -- Return error as JSON so frontend can handle it gracefully
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ==============================================================================
-- 5. Clean up connections (Optional but helpful)
-- ==============================================================================
DO $$
BEGIN
    PERFORM pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE state = 'idle' 
    AND pid <> pg_backend_pid()
    AND datname = current_database();
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
