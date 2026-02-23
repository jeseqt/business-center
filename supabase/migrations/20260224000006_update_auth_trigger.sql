
-- 20260224000006_update_auth_trigger.sql
-- 目的：自动同步 auth.users 到 platform_users 和 platform_user_bindings
-- 修改记录：
-- v2: 强制要求 user_metadata 提供 app_slug 或 app_id，否则报错

-- 创建函数：处理新用户注册
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
as $$
declare
    v_app_id uuid;
    v_app_slug text;
    v_input_app_id uuid;
    v_existing_user_id uuid;
begin
    -- 1. 从 user_metadata 获取应用标识
    -- 优先检查 app_slug (别名)，其次检查 app_id (UUID)
    v_app_slug := new.raw_user_meta_data->>'app_slug';
    
    if v_app_slug is not null then
        select id into v_app_id from public.platform_apps where slug = v_app_slug limit 1;
        if v_app_id is null then
            raise exception 'Invalid app_slug provided: %', v_app_slug;
        end if;
    else
        -- 尝试解析 app_id
        begin
            v_input_app_id := (new.raw_user_meta_data->>'app_id')::uuid;
        exception when others then
            v_input_app_id := null;
        end;

        if v_input_app_id is not null then
            select id into v_app_id from public.platform_apps where id = v_input_app_id limit 1;
            if v_app_id is null then
                raise exception 'Invalid app_id provided: %', v_input_app_id;
            end if;
        end if;
    end if;

    -- 2. 强制校验：必须提供有效的 App 归属
    if v_app_id is null then
        raise exception 'Registration requires a valid app_slug or app_id in user_metadata';
    end if;

    -- 3. 检查是否存在同名邮箱的 platform_user
    select id into v_existing_user_id
    from public.platform_users
    where email = new.email
    limit 1;

    if v_existing_user_id is not null then
        -- A. 用户已存在：更新 external_user_id 并添加绑定
        update public.platform_users
        set external_user_id = new.id::text,
            email = new.email, -- 确保邮箱最新
            last_active_at = now()
        where id = v_existing_user_id;
        
        -- 插入绑定记录
        insert into public.platform_user_bindings (platform_user_id, app_id, external_user_id, identity_type)
        values (v_existing_user_id, v_app_id, new.id::text, 'auth_user_id')
        on conflict (app_id, external_user_id, identity_type) do nothing;
        
    else
        -- B. 用户不存在：创建新用户
        -- 为了保持 ID 一致性，尝试使用 new.id 作为 platform_users.id
        insert into public.platform_users (
            id,
            app_id,
            external_user_id,
            email,
            status,
            metadata
        ) values (
            new.id, -- 尝试让 ID 一致
            v_app_id,
            new.id::text,
            new.email,
            'active',
            jsonb_build_object(
                'source', 'auth_trigger',
                'display_name', coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
            )
        );

        -- 插入绑定记录
        insert into public.platform_user_bindings (platform_user_id, app_id, external_user_id, identity_type)
        values (new.id, v_app_id, new.id::text, 'auth_user_id')
        on conflict (app_id, external_user_id, identity_type) do nothing;
    end if;

    return new;
end;
$$;

-- 创建触发器
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();
