-- Function to get dashboard data with auto-creation logic
-- This function runs with SECURITY DEFINER to bypass RLS issues during auto-creation
CREATE OR REPLACE FUNCTION get_or_create_user_dashboard_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID;
    p_user_id UUID;
    app_id_val UUID;
    result JSONB;
    v_platform_user JSONB;
    v_wallet JSONB;
    v_transactions JSONB;
BEGIN
    -- Get current Auth user ID
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Not authenticated');
    END IF;

    -- 1. Try to find existing platform_user
    SELECT id INTO p_user_id 
    FROM platform_users 
    WHERE external_user_id = current_user_id
    LIMIT 1;

    -- 2. If not found, create one
    IF p_user_id IS NULL THEN
        -- Find an active app
        SELECT id INTO app_id_val FROM platform_apps WHERE status = 'active' LIMIT 1;
        
        -- Fallback to any app
        IF app_id_val IS NULL THEN
            SELECT id INTO app_id_val FROM platform_apps LIMIT 1;
        END IF;

        -- If we found an app, create the user
        IF app_id_val IS NOT NULL THEN
            INSERT INTO platform_users (external_user_id, app_id)
            VALUES (current_user_id, app_id_val)
            RETURNING id INTO p_user_id;
        END IF;
    END IF;

    -- 3. Fetch data to return
    -- Platform User
    SELECT to_jsonb(u.*) INTO v_platform_user 
    FROM platform_users u 
    WHERE u.id = p_user_id;

    -- Wallet
    SELECT to_jsonb(w.*) INTO v_wallet 
    FROM platform_wallets w 
    WHERE w.platform_user_id = p_user_id
    LIMIT 1;

    -- Transactions
    SELECT coalesce(jsonb_agg(t.*), '[]'::jsonb) INTO v_transactions
    FROM (
        SELECT * FROM platform_wallet_transactions t
        JOIN platform_wallets w ON w.id = t.wallet_id
        WHERE w.platform_user_id = p_user_id
        ORDER BY t.created_at DESC
        LIMIT 5
    ) t;

    -- Build final JSON
    result := jsonb_build_object(
        'platform_user', v_platform_user,
        'wallet', v_wallet,
        'transactions', v_transactions
    );

    RETURN result;
END;
$$;
