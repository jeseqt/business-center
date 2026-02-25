-- Create platform_banners table
CREATE TABLE IF NOT EXISTS platform_banners (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT NOT NULL,
    link_url TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE platform_banners ENABLE ROW LEVEL SECURITY;

-- Policies
-- Everyone can read active banners
DROP POLICY IF EXISTS "Everyone can read active banners" ON platform_banners;
CREATE POLICY "Everyone can read active banners" ON platform_banners
    FOR SELECT
    USING (is_active = true);

-- Admins can do everything
-- Using is_platform_admin() function to avoid RLS recursion and ensure security
DROP POLICY IF EXISTS "Admins can do everything on banners" ON platform_banners;
CREATE POLICY "Admins can do everything on banners" ON platform_banners
    FOR ALL
    USING (is_platform_admin());

-- Insert some default sample banners
INSERT INTO platform_banners (title, description, image_url, sort_order, is_active)
VALUES 
    ('AI 助力商业化', '专注于利用AI实现产品化、场景化与商业化。快速转化为AI原生应用。', 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=2000', 0, true),
    ('智能算力引擎', '高性能 GPU 集群，为您的 AI 模型训练提供强大动力。', 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&q=80&w=2000', 1, true),
    ('企业级解决方案', '定制化私有部署，保障数据安全与业务连续性。', 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=2000', 2, true);
