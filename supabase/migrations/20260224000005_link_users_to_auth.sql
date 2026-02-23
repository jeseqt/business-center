
-- 20260224000005_link_users_to_auth.sql
-- 目的：自动修复不匹配的用户 ID，并建立外键约束

-- 1. [数据修正] 将所有邮箱匹配但 ID 不匹配的用户，强制更新为 Auth 表的真实 ID
-- 这会修复像 yinjunzhe... 这种 ID 被还原或从未正确更新的情况
UPDATE public.platform_users pu
SET external_user_id = au.id::text
FROM auth.users au
WHERE pu.email = au.email
  AND pu.external_user_id != au.id::text;

-- 2. [数据修正] 如果还有剩下的用户 external_user_id 不是 UUID 格式 (比如完全找不到 Auth 账号)，置为 NULL
-- 以免后面转换 UUID 类型时报错
UPDATE public.platform_users
SET external_user_id = NULL
WHERE external_user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 3. [结构变更] 将 external_user_id 转换为 UUID 类型
ALTER TABLE public.platform_users 
ALTER COLUMN external_user_id TYPE uuid USING external_user_id::uuid;

-- 4. [结构变更] 添加外键约束
ALTER TABLE public.platform_users
ADD CONSTRAINT fk_platform_users_auth_user
FOREIGN KEY (external_user_id) 
REFERENCES auth.users(id)
ON DELETE SET NULL;
