-- Migration ID: 20260227000014_add_app_slug
-- Description: Adds slug column to platform_apps and populates it

-- 1. Add slug column
ALTER TABLE public.platform_apps 
ADD COLUMN IF NOT EXISTS slug text;

-- 2. Add unique constraint
ALTER TABLE public.platform_apps 
DROP CONSTRAINT IF EXISTS platform_apps_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_apps_slug ON public.platform_apps(slug);

-- 3. Populate existing data
UPDATE public.platform_apps
SET slug = 'business-center'
WHERE slug IS NULL;

-- 4. Make it not null (optional, but good for consistency)
-- We keep it nullable for now to avoid issues with potential future apps created without slug, 
-- though the trigger requires it.
