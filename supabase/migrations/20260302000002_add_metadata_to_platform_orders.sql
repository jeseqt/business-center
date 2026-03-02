-- Migration: Add metadata column to platform_orders
ALTER TABLE public.platform_orders ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
