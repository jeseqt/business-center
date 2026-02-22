-- 015_add_invite_required.sql
-- 目的：在应用表中增加 invite_required 字段，用于控制应用是否开启邀请码验证
-- 默认值为 false (不强制验证)

ALTER TABLE public.platform_apps 
ADD COLUMN IF NOT EXISTS invite_required boolean DEFAULT false;
