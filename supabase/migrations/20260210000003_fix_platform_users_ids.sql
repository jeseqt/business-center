-- 修复 platform_users ID 与 auth.users ID 不一致的问题
-- 确保 platform_users 表中的 id 与 auth.users 表中的 id 一致，以便外键关联正确

DO $$
DECLARE
    r RECORD;
BEGIN
    -- 临时禁用约束检查，允许更新主键
    -- 注意：需要 Superuser 权限，本地开发环境通常具备
    SET session_replication_role = 'replica';

    FOR r IN 
        SELECT pu.id AS old_id, au.id AS new_id, pu.email
        FROM public.platform_users pu
        JOIN auth.users au ON pu.email = au.email
        WHERE pu.id != au.id
    LOOP
        RAISE NOTICE 'Fixing user %: % -> %', r.email, r.old_id, r.new_id;

        -- 1. 手动更新引用表 (因为 replica 模式下外键约束和级联更新不会触发)
        
        -- platform_token_usage
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_token_usage') THEN
            UPDATE public.platform_token_usage SET platform_user_id = r.new_id WHERE platform_user_id = r.old_id;
        END IF;

        -- platform_orders
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_orders') THEN
            UPDATE public.platform_orders SET platform_user_id = r.new_id WHERE platform_user_id = r.old_id;
        END IF;

        -- platform_user_invites
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_user_invites') THEN
            UPDATE public.platform_user_invites SET platform_user_id = r.new_id WHERE platform_user_id = r.old_id;
        END IF;

        -- platform_wallets 
        -- 检查是否存在 platform_user_id 列 (旧结构)
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'platform_wallets' AND column_name = 'platform_user_id') THEN
             UPDATE public.platform_wallets SET platform_user_id = r.new_id WHERE platform_user_id = r.old_id;
        END IF;
        
        -- 检查是否存在 user_id 列 (新结构)，且该列是否错误地存储了 old_id
        -- 注意：通常新结构钱包是基于 auth.users 创建的，存的应该是 new_id。但为了保险，检查一下。
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'platform_wallets' AND column_name = 'user_id') THEN
             UPDATE public.platform_wallets SET user_id = r.new_id WHERE user_id = r.old_id;
        END IF;

        -- 2. 最后更新主表 platform_users
        UPDATE public.platform_users SET id = r.new_id WHERE id = r.old_id;
        
    END LOOP;

    -- 恢复约束检查
    SET session_replication_role = 'origin';

END $$;
