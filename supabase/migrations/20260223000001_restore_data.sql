-- 20260223000001_restore_data.sql
-- 目的：在远程数据库重置后，快速恢复可用的业务数据
-- 1. 恢复默认应用 (Platform Apps)
-- 2. 自动将现有的 Auth 用户提升为管理员 (方便开发调试)
-- 3. 创建测试邀请码

-- ==============================================================================
-- 1. 恢复核心应用数据
-- ==============================================================================
INSERT INTO public.platform_apps (
    name,
    description,
    app_key,
    app_secret_hash,
    status,
    invite_required,
    daily_token_limit
) VALUES 
(
    'Demo App',
    '默认测试应用',
    'ak_demo_123456',
    'hash_demo_secret', -- 实际环境请使用真实哈希
    'active',
    false,
    100000
),
(
    'Voice Chat Pro',
    '语音对话应用示例',
    'ak_voice_chat_001',
    'hash_voice_secret',
    'active',
    true, -- 开启邀请码验证
    500000
)
ON CONFLICT (app_key) DO UPDATE SET
    invite_required = EXCLUDED.invite_required; -- 确保邀请码设置被更新

-- ==============================================================================
-- 2. 恢复/创建邀请码
-- ==============================================================================
-- 为 Voice Chat Pro 创建通用邀请码
INSERT INTO public.platform_invite_codes (
    app_id,
    code,
    max_usage,
    valid_days,
    status
)
SELECT 
    id,
    'VIP888',
    1000, -- 可使用1000次
    365,
    'active'
FROM public.platform_apps WHERE app_key = 'ak_voice_chat_001'
ON CONFLICT (app_id, code) DO NOTHING;

-- ==============================================================================
-- 3. 权限修复：将所有现有的 Auth 用户自动关联为 Admin
-- ==============================================================================
-- 这能确保如果你之前注册过账号，现在可以直接作为管理员登录
INSERT INTO public.platform_admin_profiles (id, role, display_name)
SELECT 
    id, 
    'super_admin', 
    coalesce(raw_user_meta_data->>'full_name', email, 'Admin User')
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
    role = 'super_admin'; -- 强制提升为管理员

-- ==============================================================================
-- 4. 用户关联修复：将 Auth 用户关联到 Platform Users (归属到 Demo App)
-- ==============================================================================
INSERT INTO public.platform_users (
    app_id,
    external_user_id,
    email,
    status,
    metadata
)
SELECT 
    (SELECT id FROM public.platform_apps WHERE app_key = 'ak_demo_123456'),
    id::text, -- 使用 Auth ID 作为 External ID
    email,
    'active',
    jsonb_build_object('source', 'auto_restore')
FROM auth.users
ON CONFLICT (app_id, external_user_id) DO NOTHING;
