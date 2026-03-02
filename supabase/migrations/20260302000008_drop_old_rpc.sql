
-- Drop the old RPC function with UUID user_id signature to resolve ambiguity
DROP FUNCTION IF EXISTS public.process_wallet_transaction(uuid, int, text, uuid, uuid, text);
