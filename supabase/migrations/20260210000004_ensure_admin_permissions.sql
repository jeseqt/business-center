-- 确保管理员用户存在并具有 admin 权限
DO $$
DECLARE
    v_user_id uuid;
BEGIN
    -- 1. 查找用户的 UUID
    SELECT id INTO v_user_id FROM auth.users WHERE email = '1281311628@qq.com';

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found: 1281311628@qq.com';
    END IF;

    -- 2. 检查 platform_admin_profiles 是否存在
    IF NOT EXISTS (SELECT 1 FROM public.platform_admin_profiles WHERE id = v_user_id) THEN
        INSERT INTO public.platform_admin_profiles (id, display_name, role)
        VALUES (v_user_id, 'Admin', 'admin');
        RAISE NOTICE 'Added user % as admin', v_user_id;
    ELSE
        -- 确保角色是 admin 或 super_admin
        UPDATE public.platform_admin_profiles 
        SET role = 'admin' 
        WHERE id = v_user_id AND role NOT IN ('admin', 'super_admin');
        RAISE NOTICE 'Updated user % role to admin', v_user_id;
    END IF;
END $$;
