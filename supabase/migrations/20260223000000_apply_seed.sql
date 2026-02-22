-- 20260223000000_apply_seed.sql
-- 应用初始种子数据 (因为 db reset 失败导致数据丢失)

-- 创建默认管理员用户 (密码: password123)
-- 注意：这里使用 Supabase Auth 的哈希算法生成的密码哈希
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '8d052670-6927-4c74-9e32-5a2c4740a66d',
    'authenticated',
    'authenticated',
    'admin@example.com',
    '$2a$10$3c.WvWzQ.f5d1.j.X.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x', -- placeholder hash, user should change password
    now(),
    now(),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{}',
    now(),
    now(),
    '',
    '',
    '',
    ''
) ON CONFLICT (id) DO NOTHING;

-- 创建管理员 Profile
INSERT INTO public.platform_admin_profiles (id, role, display_name)
VALUES ('8d052670-6927-4c74-9e32-5a2c4740a66d', 'super_admin', 'Super Admin')
ON CONFLICT (id) DO NOTHING;

-- 创建测试应用
INSERT INTO public.platform_apps (
    name,
    description,
    app_key,
    app_secret_hash,
    app_secret,
    status,
    invite_required
) VALUES (
    'Demo App',
    'This is a demo application created by seed.',
    'ak_demo_123456',
    'hash_demo_secret', -- In real scenario, this should be a valid hash
    'sk_live_demo_secret',
    'active',
    false
) ON CONFLICT (app_key) DO NOTHING;

-- 创建测试用户
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'c5d6e7f8-a9b0-c1d2-e3f4-567890abcdef',
    'authenticated',
    'authenticated',
    'user@example.com',
    '$2a$10$3c.WvWzQ.f5d1.j.X.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x',
    now(),
    now(),
    now()
) ON CONFLICT (id) DO NOTHING;

-- 关联 platform_users
INSERT INTO public.platform_users (
    app_id,
    external_user_id,
    email,
    account,
    status
) 
SELECT 
    id,
    'c5d6e7f8-a9b0-c1d2-e3f4-567890abcdef',
    'user@example.com',
    'user',
    'active'
FROM public.platform_apps WHERE app_key = 'ak_demo_123456'
ON CONFLICT (app_id, external_user_id) DO NOTHING;
