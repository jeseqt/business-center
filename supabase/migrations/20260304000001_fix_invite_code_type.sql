-- 20260304000001_fix_invite_code_type.sql
-- 修复旧的邀请码数据，将 type 为 NULL 的记录设为 'activity'

-- 1. 确保 type 字段存在 (如果之前的 schema 没有明确定义)
ALTER TABLE public.platform_invite_codes 
ADD COLUMN IF NOT EXISTS type text DEFAULT 'activity';

-- 2. 将 NULL 值更新为 'activity'
-- 注意：这里假设之前遗漏 type 的都是由 get-invite-code 生成的活动邀请码
UPDATE public.platform_invite_codes
SET type = 'activity'
WHERE type IS NULL;

-- 3. 添加索引以优化查询
CREATE INDEX IF NOT EXISTS idx_platform_invite_codes_type ON public.platform_invite_codes(type);
