-- 20260224000001_fix_missing_columns.sql
-- Ensure critical columns exist for app creation

-- 1. Ensure invite_required exists
ALTER TABLE public.platform_apps 
ADD COLUMN IF NOT EXISTS invite_required boolean DEFAULT false;

-- 2. Ensure app_secret exists
ALTER TABLE public.platform_apps 
ADD COLUMN IF NOT EXISTS app_secret text;

-- 3. Ensure app_secret_hash exists (should exist from init, but good to check)
ALTER TABLE public.platform_apps 
ADD COLUMN IF NOT EXISTS app_secret_hash text;

-- 4. Ensure platform_app_tickets exists (handled by previous migration, but just in case)
-- (Skipping table creation here to avoid conflicts with the other migration file)
