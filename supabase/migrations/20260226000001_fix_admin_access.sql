-- 20260226000001_fix_admin_access.sql

-- 1. 优化 RLS 策略：允许用户读取自己的 Admin Profile，无论是否是管理员
-- 这避免了 "只有管理员才能检查自己是不是管理员" 的逻辑闭环风险，并提供更好的调试信息
DROP POLICY IF EXISTS "Admins can view admin profiles" ON public.platform_admin_profiles;

CREATE POLICY "Users can view own admin profile" ON public.platform_admin_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all admin profiles" ON public.platform_admin_profiles
    FOR SELECT USING (is_platform_admin());

-- 2. 确保 lambertcosine@163.com 是超级管理员
DO $$
DECLARE
    v_target_email text := 'lambertcosine@163.com';
    v_user_id uuid;
BEGIN
    -- 从 auth.users 获取 ID
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_target_email;
    
    IF v_user_id IS NOT NULL THEN
        -- 插入或更新管理员配置
        INSERT INTO public.platform_admin_profiles (id, role, display_name)
        VALUES (v_user_id, 'super_admin', v_target_email)
        ON CONFLICT (id) DO UPDATE
        SET role = 'super_admin',
            display_name = v_target_email; -- 确保显示名称也更新
            
        RAISE NOTICE 'Successfully promoted % (ID: %) to super_admin', v_target_email, v_user_id;
    ELSE
        RAISE NOTICE 'WARNING: User % not found in auth.users. Please sign up first.', v_target_email;
    END IF;
END $$;
