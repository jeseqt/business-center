-- Migration ID: 20260331000002_fix_wallet_rls
-- Description: Update RLS policies for platform_wallets and platform_wallet_transactions to use the new user_id column instead of the removed platform_user_id.

-- 1. Update RLS for platform_wallets
DROP POLICY IF EXISTS "Users can view own wallet" ON public.platform_wallets;
CREATE POLICY "Users can view own wallet" ON public.platform_wallets
    FOR SELECT USING (
        user_id = auth.uid()
    );

-- 2. Update RLS for platform_wallet_transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON public.platform_wallet_transactions;
CREATE POLICY "Users can view own transactions" ON public.platform_wallet_transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.platform_wallets
            WHERE id = platform_wallet_transactions.wallet_id
            AND user_id = auth.uid()
        )
    );
