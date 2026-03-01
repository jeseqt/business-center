-- Add 'bagelpay' to platform_orders channel check constraint
ALTER TABLE public.platform_orders DROP CONSTRAINT IF EXISTS platform_orders_channel_check;
ALTER TABLE public.platform_orders ADD CONSTRAINT platform_orders_channel_check 
    CHECK (channel IN ('wechat', 'alipay', 'stripe', 'apple', 'mock', 'bagelpay'));

-- Create or replace the wallet transaction processing function
CREATE OR REPLACE FUNCTION public.process_wallet_transaction(
    _user_id uuid,          -- Auth User ID
    _amount int,            -- Amount (positive for deposit, negative for payment)
    _type text,             -- Transaction type: 'deposit', 'payment', 'refund', 'bonus'
    _app_id uuid,           -- App ID
    _order_id uuid DEFAULT NULL, -- Optional associated order ID
    _description text DEFAULT NULL -- Optional description
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_platform_user_id uuid;
    v_wallet_id uuid;
    v_current_balance int;
    v_new_balance int;
    v_transaction_id uuid;
BEGIN
    -- 1. Find platform_user_id
    SELECT id INTO v_platform_user_id
    FROM public.platform_users
    WHERE external_user_id = _user_id::text AND app_id = _app_id
    LIMIT 1;

    IF v_platform_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found for app_id: ' || _app_id || ' and user_id: ' || _user_id);
    END IF;

    -- 2. Find wallet and lock row for update
    SELECT id, balance_permanent INTO v_wallet_id, v_current_balance
    FROM public.platform_wallets
    WHERE platform_user_id = v_platform_user_id AND app_id = _app_id
    FOR UPDATE;

    IF v_wallet_id IS NULL THEN
        -- Auto-create wallet if missing
        INSERT INTO public.platform_wallets (app_id, platform_user_id, balance_permanent)
        VALUES (_app_id, v_platform_user_id, 0)
        RETURNING id, balance_permanent INTO v_wallet_id, v_current_balance;
    END IF;

    -- 3. Calculate new balance
    v_new_balance := v_current_balance + _amount;

    -- 4. Check for sufficient funds (only for payments/debits)
    IF _amount < 0 AND v_new_balance < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
    END IF;

    -- 5. Update wallet balance
    UPDATE public.platform_wallets
    SET balance_permanent = v_new_balance,
        updated_at = now(),
        version = version + 1
    WHERE id = v_wallet_id;

    -- 6. Record transaction
    INSERT INTO public.platform_wallet_transactions (
        wallet_id,
        amount,
        balance_after,
        type,
        description,
        metadata
    ) VALUES (
        v_wallet_id,
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
