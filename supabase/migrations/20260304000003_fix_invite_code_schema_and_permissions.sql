-- 20260304000003_fix_invite_code_schema_and_permissions.sql

-- 1. Add 'type' column if it doesn't exist
ALTER TABLE public.platform_invite_codes 
ADD COLUMN IF NOT EXISTS type text DEFAULT 'activity';

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_platform_invite_codes_type ON public.platform_invite_codes(type);

-- 3. Backfill data: Update existing records to have 'activity' type
UPDATE public.platform_invite_codes
SET type = 'activity'
WHERE type IS NULL OR type = '';

-- 4. Enable RLS
ALTER TABLE public.platform_invite_codes ENABLE ROW LEVEL SECURITY;

-- 5. Drop old policies to ensure a clean slate
DROP POLICY IF EXISTS "Admins can view all invite codes" ON public.platform_invite_codes;
DROP POLICY IF EXISTS "Admins can create invite codes" ON public.platform_invite_codes;
DROP POLICY IF EXISTS "Admins can update invite codes" ON public.platform_invite_codes;
DROP POLICY IF EXISTS "Admins can delete invite codes" ON public.platform_invite_codes;
DROP POLICY IF EXISTS "Admins can view invite codes" ON public.platform_invite_codes;

-- 6. Create Admin policies (using is_platform_admin helper)
-- View
CREATE POLICY "Admins can view all invite codes"
ON public.platform_invite_codes
FOR SELECT
TO authenticated
USING ( public.is_platform_admin() );

-- Insert
CREATE POLICY "Admins can create invite codes"
ON public.platform_invite_codes
FOR INSERT
TO authenticated
WITH CHECK ( public.is_platform_admin() );

-- Update
CREATE POLICY "Admins can update invite codes"
ON public.platform_invite_codes
FOR UPDATE
TO authenticated
USING ( public.is_platform_admin() );

-- Delete
CREATE POLICY "Admins can delete invite codes"
ON public.platform_invite_codes
FOR DELETE
TO authenticated
USING ( public.is_platform_admin() );
