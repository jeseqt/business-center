-- 修复 RLS 递归导致的死锁问题
-- 必须确保 is_platform_admin 是 security definer 且 search_path 正确

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public -- 关键：防止恶意劫持，且通常能帮助明确上下文
AS $$
BEGIN
  -- 由于是 SECURITY DEFINER，此查询将以函数创建者（通常是 postgres）的权限运行
  -- postgres 角色通常具有 BYPASSRLS 属性，因此不会触发 RLS，避免递归
  RETURN EXISTS (
    SELECT 1 FROM public.platform_admin_profiles
    WHERE id = auth.uid()
  );
END;
$$;

-- 优化 platform_admin_profiles 的策略
-- 先删除旧策略
DROP POLICY IF EXISTS "Admins can view admin profiles" ON public.platform_admin_profiles;
DROP POLICY IF EXISTS "Users can view own admin profile" ON public.platform_admin_profiles;

-- 1. 基础策略：允许任何人读取自己的记录 (这是打破递归的基石，也是最快的检查路径)
CREATE POLICY "Users can view own admin profile" ON public.platform_admin_profiles
    FOR SELECT USING (auth.uid() = id);

-- 2. 管理员策略：允许管理员读取所有记录
-- 这里调用 is_platform_admin()，由于上面的函数修复，它不会再触发 RLS
CREATE POLICY "Admins can view all admin profiles" ON public.platform_admin_profiles
    FOR SELECT USING (is_platform_admin());
