-- Add BagelPay specific columns to platform_orders
ALTER TABLE public.platform_orders ADD COLUMN IF NOT EXISTS bagelpay_checkout_id text;
ALTER TABLE public.platform_orders ADD COLUMN IF NOT EXISTS bagelpay_session_url text;

-- Add index for bagelpay_checkout_id for faster lookups during webhook processing
CREATE INDEX IF NOT EXISTS idx_platform_orders_bagelpay_checkout_id ON public.platform_orders(bagelpay_checkout_id);
