-- 20260225000006_promote_lambert.sql
DO $$
DECLARE
    v_target_email text := 'lambertcosine@163.com';
    v_user_id uuid;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_target_email;
    
    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.platform_admin_profiles (id, role, display_name)
        VALUES (v_user_id, 'super_admin', v_target_email)
        ON CONFLICT (id) DO UPDATE
        SET role = 'super_admin';
        RAISE NOTICE 'Promoted % to super_admin', v_target_email;
    ELSE
        RAISE NOTICE 'User % not found, skipping promotion', v_target_email;
    END IF;
END $$;
