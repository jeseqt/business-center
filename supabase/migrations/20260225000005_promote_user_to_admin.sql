-- 20260225000005_promote_user_to_admin.sql
-- 目的：将指定用户提升为管理员
-- 使用说明：请将下方的 'your_email@example.com' 替换为您实际登录的邮箱

DO $$
DECLARE
    v_target_email text := 'your_email@example.com'; -- 在此处填入您的邮箱
    v_user_id uuid;
BEGIN
    -- 0. 安全检查：如果是默认邮箱，则跳过
    IF v_target_email = 'your_email@example.com' THEN
        RAISE NOTICE 'Skipping admin promotion: Default email not changed. Please edit this migration file with your actual email to promote yourself.';
        RETURN;
    END IF;

    -- 1. 查找用户 ID
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_target_email;
    
    IF v_user_id IS NULL THEN
        RAISE WARNING 'User with email % not found, skipping promotion', v_target_email;
        RETURN;
    END IF;

    -- 2. 插入或更新管理员配置
    INSERT INTO public.platform_admin_profiles (id, role, display_name)
    VALUES (v_user_id, 'super_admin', v_target_email)
    ON CONFLICT (id) DO UPDATE
    SET role = 'super_admin',
        display_name = EXCLUDED.display_name;
        
    RAISE NOTICE 'User % (ID: %) has been promoted to super_admin', v_target_email, v_user_id;
END $$;
