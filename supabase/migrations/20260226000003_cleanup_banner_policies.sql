-- 20260226000003_cleanup_banner_policies.sql
-- Cleanup duplicate policies on platform_banners and ensure correct access

-- 1. Reset platform_banners Policies
ALTER TABLE public.platform_banners ENABLE ROW LEVEL SECURITY;

-- Drop all known admin policies on this table to avoid duplicates
DROP POLICY IF EXISTS "Admins can do everything on banners" ON public.platform_banners;
DROP POLICY IF EXISTS "Admins can manage banners" ON public.platform_banners;

-- Re-create the single authoritative admin policy
CREATE POLICY "Admins can manage banners" ON public.platform_banners
    FOR ALL USING (is_platform_admin());

-- Ensure public read policy is correct
DROP POLICY IF EXISTS "Everyone can read active banners" ON public.platform_banners;
CREATE POLICY "Everyone can read active banners" ON public.platform_banners
    FOR SELECT USING (is_active = true);

-- 2. Storage Bucket Policies (Just in case)
-- Ensure 'banner-images' bucket is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('banner-images', 'banner-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Ensure admin upload policy relies on is_platform_admin()
DROP POLICY IF EXISTS "Admin Insert" ON storage.objects;
CREATE POLICY "Admin Insert" ON storage.objects
    FOR INSERT WITH CHECK ( bucket_id = 'banner-images' AND is_platform_admin() );

DROP POLICY IF EXISTS "Admin Update" ON storage.objects;
CREATE POLICY "Admin Update" ON storage.objects
    FOR UPDATE USING ( bucket_id = 'banner-images' AND is_platform_admin() );

DROP POLICY IF EXISTS "Admin Delete" ON storage.objects;
CREATE POLICY "Admin Delete" ON storage.objects
    FOR DELETE USING ( bucket_id = 'banner-images' AND is_platform_admin() );
