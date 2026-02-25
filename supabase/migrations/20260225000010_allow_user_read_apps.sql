-- 允许认证用户读取 platform_apps (仅限 id 和 name 等非敏感字段，通过 Select 限制)
-- 注意：RLS 是行级的，所以我们允许读取 active 的应用
-- 前端 UserHome.tsx 需要读取 platform_apps 的 id 来自动创建用户关联

ALTER TABLE public.platform_apps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view active apps" ON public.platform_apps;

CREATE POLICY "Authenticated users can view active apps" ON public.platform_apps
    FOR SELECT
    TO authenticated
    USING (status = 'active');

-- 同时也允许 public (匿名用户) 读取 active apps? 
-- 暂时只允许 authenticated，因为 UserHome 是登录后访问的。
