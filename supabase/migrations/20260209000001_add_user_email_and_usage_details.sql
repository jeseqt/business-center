-- 20260209000001_add_user_email_and_usage_details.sql

-- 1. 为 platform_users 添加 email 字段
ALTER TABLE public.platform_users 
ADD COLUMN IF NOT EXISTS email text;

-- 2. 为 platform_token_usage 添加详细统计字段
ALTER TABLE public.platform_token_usage 
ADD COLUMN IF NOT EXISTS cache_read_tokens int default 0,
ADD COLUMN IF NOT EXISTS cache_creation_tokens int default 0;

-- 3. 创建索引 (如果不存在)
CREATE INDEX IF NOT EXISTS idx_platform_users_email ON public.platform_users(email);
