-- ==============================================================================
-- 修复用户 ID 不一致问题
-- 版本: 1.0.1
-- 描述: 
-- 1. 将引用 platform_users 的外键修改为 ON UPDATE CASCADE
-- 2. 将 platform_users.id 更新为对应的 auth.users.id
-- ==============================================================================

DO $$
DECLARE
    r RECORD;
    fk RECORD;
    v_auth_user_id UUID;
BEGIN
    -- 1. 修改外键为级联更新 (ON UPDATE CASCADE)
    -- 查找所有引用 platform_users(id) 的外键
    FOR fk IN 
        SELECT
            tc.table_schema, 
            tc.constraint_name, 
            tc.table_name, 
            kcu.column_name
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name='platform_users'
    LOOP
        RAISE NOTICE 'Modifying constraint: %.% (Column: %)', fk.table_name, fk.constraint_name, fk.column_name;
        
        -- 删除旧约束
        EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', fk.table_schema, fk.table_name, fk.constraint_name);
        
        -- 添加新约束 (ON UPDATE CASCADE ON DELETE SET NULL)
        -- 这里我们统一假设引用行为是 SET NULL，这符合之前 platform_orders 和 platform_token_usage 的定义
        EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.platform_users(id) ON DELETE SET NULL ON UPDATE CASCADE', 
            fk.table_schema, fk.table_name, fk.constraint_name, fk.column_name);
            
    END LOOP;

    -- 2. 同步 ID
    RAISE NOTICE 'Start syncing user IDs...';
    
    FOR r IN SELECT * FROM public.platform_users WHERE email IS NOT NULL
    LOOP
        -- 查找 Auth User ID
        SELECT id INTO v_auth_user_id FROM auth.users WHERE email = r.email;
        
        IF v_auth_user_id IS NOT NULL AND v_auth_user_id != r.id THEN
            RAISE NOTICE 'Syncing user ID for %: % -> %', r.email, r.id, v_auth_user_id;
            
            BEGIN
                -- 更新 platform_users ID (会自动级联更新引用表)
                UPDATE public.platform_users SET id = v_auth_user_id WHERE id = r.id;
            EXCEPTION WHEN unique_violation THEN
                RAISE WARNING 'Skipping user % (ID collision): User with this Auth ID already exists in platform_users.', r.email;
            WHEN OTHERS THEN
                RAISE WARNING 'Error syncing user %: %', r.email, SQLERRM;
            END;
            
        END IF;
    END LOOP;
    
    RAISE NOTICE 'ID synchronization completed.';
END $$;
