-- 20260225000003_fix_missing_platform_users.sql
-- 目的：修复在 auth.users 中存在但在 platform_users 中缺失的用户记录
-- 场景：用户通过 Admin Portal 或其他未触发 Trigger 的方式注册，导致业务数据缺失

do $$
declare
    v_default_app_id uuid;
    v_user record;
    v_platform_user_id uuid;
    v_count int := 0;
begin
    -- 1. 获取默认 App ID (优先找 Voice Reflect，找不到就找第一个)
    -- 这是一个兜底策略，假设这些孤儿用户都归属于主 App
    -- select id into v_default_app_id from public.platform_apps where slug = 'voice-reflect' limit 1;
    -- if v_default_app_id is null then
        select id into v_default_app_id from public.platform_apps order by created_at asc limit 1;
    -- end if;

    if v_default_app_id is null then
        raise notice 'No apps found, skipping migration';
        return;
    end if;

    raise notice 'Using default App ID: %', v_default_app_id;

    -- 2. 遍历孤儿用户
    -- 排除 admin 用户 (虽然 admin 也可能需要 platform_user，但 admin 通常有专门的 admin_profiles)
    -- 这里我们假设所有 auth 用户都应该有 platform_user 身份
    for v_user in 
        select id, email, raw_user_meta_data 
        from auth.users 
        where id not in (select external_user_id::uuid from public.platform_users)
    loop
        -- 3. 创建 platform_users
        insert into public.platform_users (
            app_id,
            external_user_id,
            email,
            status,
            metadata
        ) values (
            v_default_app_id,
            v_user.id,
            v_user.email,
            'active',
            jsonb_build_object(
                'source', 'migration_fix',
                'display_name', coalesce(v_user.raw_user_meta_data->>'display_name', split_part(v_user.email, '@', 1))
            )
        )
        returning id into v_platform_user_id;

        -- 4. 创建 platform_wallets
        insert into public.platform_wallets (
            app_id,
            platform_user_id,
            balance_permanent,
            balance_temporary
        ) values (
            v_default_app_id,
            v_platform_user_id,
            0,
            0
        )
        on conflict (app_id, platform_user_id) do nothing;
        
        v_count := v_count + 1;
        raise notice 'Fixed user: % (Platform ID: %)', v_user.email, v_platform_user_id;
    end loop;

    raise notice 'Migration completed. Fixed % users.', v_count;
end;
$$;
