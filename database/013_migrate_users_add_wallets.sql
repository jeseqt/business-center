-- ==============================================================================
-- 业务中台用户数据迁移脚本
-- 版本: 1.0.0
-- 描述: 
-- 1. 遍历 platform_users 表中已存在的用户
-- 2. 为其创建 Supabase Auth 账号（如果不存在），初始密码 Lc2026
-- 3. 确保存在这个用户的统一钱包
-- ==============================================================================

DO $$
DECLARE
    r RECORD;
    v_user_id UUID;
    v_password TEXT := 'Lc2026';
    v_encrypted_pw TEXT;
BEGIN
    -- 确保 pgcrypto 扩展已启用
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    
    -- 预计算密码哈希 (避免循环中重复计算)
    v_encrypted_pw := crypt(v_password, gen_salt('bf'));

    RAISE NOTICE 'Start migrating users...';

    -- 遍历所有有邮箱的业务用户
    -- 假设 platform_users 表中的 email 字段用于登录
    FOR r IN SELECT * FROM public.platform_users WHERE email IS NOT NULL
    LOOP
        -- 1. 查询是否已存在 Auth 用户 (通过 email 匹配)
        SELECT id INTO v_user_id FROM auth.users WHERE email = r.email;

        IF v_user_id IS NULL THEN
            -- 不存在，创建新 Auth 用户
            v_user_id := uuid_generate_v4();
            
            -- 插入 auth.users
            -- 注意：instance_id 默认为 '00000000-0000-0000-0000-000000000000'
            INSERT INTO auth.users (
                id,
                instance_id,
                aud,
                role,
                email,
                encrypted_password,
                email_confirmed_at,
                raw_app_meta_data,
                raw_user_meta_data,
                created_at,
                updated_at,
                is_super_admin
            ) VALUES (
                v_user_id,
                '00000000-0000-0000-0000-000000000000',
                'authenticated',
                'authenticated',
                r.email,
                v_encrypted_pw,
                now(), -- 默认已验证邮箱
                '{"provider": "email", "providers": ["email"]}',
                jsonb_build_object('name', r.account, 'external_user_id', r.external_user_id), -- 将业务信息存入 metadata
                now(),
                now(),
                false
            );

            -- 插入 auth.identities (用于支持 Email 登录)
            -- identity_id 对于 email provider 通常就是 user_id
            INSERT INTO auth.identities (
                id,
                user_id,
                identity_data,
                provider,
                last_sign_in_at,
                created_at,
                updated_at
            ) VALUES (
                v_user_id, -- identity id
                v_user_id, -- user_id
                jsonb_build_object('sub', v_user_id, 'email', r.email),
                'email',
                NULL,
                now(),
                now()
            );
            
            RAISE NOTICE 'Created auth user for email: % (ID: %)', r.email, v_user_id;
        ELSE
            -- 已存在，可选择是否重置密码
            -- 这里我们假设如果账号已存在，则只确保钱包存在，不强制重置密码以免影响用户
            -- 如果需要强制重置密码，请取消下行注释：
            -- UPDATE auth.users SET encrypted_password = v_encrypted_pw WHERE id = v_user_id;
            
            RAISE NOTICE 'Auth user already exists for email: %, checking wallet...', r.email;
        END IF;

        -- 2. 检查并创建钱包
        IF NOT EXISTS (SELECT 1 FROM public.platform_wallets WHERE user_id = v_user_id) THEN
            INSERT INTO public.platform_wallets (
                user_id,
                balance,
                currency
            ) VALUES (
                v_user_id,
                0, -- 初始余额 0
                'CNY'
            );
            RAISE NOTICE 'Created wallet for user: %', v_user_id;
        ELSE
            RAISE NOTICE 'Wallet already exists for user: %', v_user_id;
        END IF;

    END LOOP;
    
    RAISE NOTICE 'Migration completed.';
END $$;
