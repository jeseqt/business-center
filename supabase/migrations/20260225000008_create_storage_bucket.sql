-- Create storage bucket for banner images
INSERT INTO storage.buckets (id, name, public)
VALUES ('banner-images', 'banner-images', true)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies for the bucket
-- Allow public access to view images
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'banner-images' );

-- Allow admins to upload/update/delete images
-- Note: We are using the previously defined is_platform_admin() function
CREATE POLICY "Admin Insert"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'banner-images' AND is_platform_admin() );

CREATE POLICY "Admin Update"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'banner-images' AND is_platform_admin() );

CREATE POLICY "Admin Delete"
ON storage.objects FOR DELETE
USING ( bucket_id = 'banner-images' AND is_platform_admin() );
