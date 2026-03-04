-- 20260304000002_fix_invite_code_rls.sql
-- 修复 platform_invite_codes 的 RLS 策略，确保管理员可以在后台看到数据

-- 1. 启用 RLS
ALTER TABLE public.platform_invite_codes ENABLE ROW LEVEL SECURITY;

-- 2. 清理旧策略 (防止冲突或残留的 restrictive 策略)
DROP POLICY IF EXISTS "Admins can view all invite codes" ON public.platform_invite_codes;
DROP POLICY IF EXISTS "Admins can create invite codes" ON public.platform_invite_codes;
DROP POLICY IF EXISTS "Admins can update invite codes" ON public.platform_invite_codes;
DROP POLICY IF EXISTS "Admins can delete invite codes" ON public.platform_invite_codes;

-- 3. 创建新的管理员策略
-- 读取: 管理员可查看所有
CREATE POLICY "Admins can view all invite codes"
ON public.platform_invite_codes
FOR SELECT
TO authenticated
USING (
  -- 检查是否为管理员 (复用 is_platform_admin 函数)
  public.is_platform_admin() 
  -- 或者如果是 service_role (用于 edge functions)
  OR (auth.jwt() ->> 'role') = 'service_role'
);

-- 插入: 管理员可创建
CREATE POLICY "Admins can create invite codes"
ON public.platform_invite_codes
FOR INSERT
TO authenticated
WITH CHECK (public.is_platform_admin());

-- 更新: 管理员可更新
CREATE POLICY "Admins can update invite codes"
ON public.platform_invite_codes
FOR UPDATE
TO authenticated
USING (public.is_platform_admin());

-- 删除: 管理员可删除
CREATE POLICY "Admins can delete invite codes"
ON public.platform_invite_codes
FOR DELETE
TO authenticated
USING (public.is_platform_admin());

-- 4. 再次确保数据清洗 (防止上一条迁移未生效)
UPDATE public.platform_invite_codes
SET type = 'activity'
WHERE type IS NULL OR type = '';

-- 5. 确保 type 字段没有空格
UPDATE public.platform_invite_codes
SET type = TRIM(type)
WHERE type IS NOT NULL;
