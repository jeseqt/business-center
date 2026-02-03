-- ==============================================================================
-- 业务中台初始化数据 (Seed Data)
-- 版本: 1.0.0
-- 描述: 注册 Voice Reflect 应用，初始化系统配置
-- 使用方法: 在 Supabase SQL Editor 中执行
-- ==============================================================================

-- 1. 注册 Voice Reflect 应用
-- 注意: 实际生产环境中，Secret 应该是由后端生成并加密存储的。
-- 这里为了演示，我们预设一个 App Key。
insert into public.platform_apps (name, description, app_key, app_secret_hash, status)
values (
    'Voice Reflect',
    'AI 语音反射应用 - 核心业务端',
    'app_vr_core_001',
    -- 这里仅存储一个标记，实际对接时需在 Edge Function 中校验
    'sha256_placeholder_for_secret', 
    'active'
)
on conflict (app_key) do nothing;

-- 2. 设置当前执行用户为超级管理员 (可选)
-- 请将下面的 UUID 替换为您在 auth.users 表中的实际 ID
-- IMPORTANT: Replace 'YOUR_USER_ID_HERE' with your actual Supabase Auth User ID
-- You can find this in the Authentication -> Users section of your Supabase Dashboard
insert into public.platform_admin_profiles (id, display_name, role)
values ('YOUR_USER_ID_HERE', 'Super Admin', 'super_admin');

-- 3. 插入一些演示用的计费数据 (可选)
do $$
declare
    v_app_id uuid;
    v_user_id uuid;
begin
    -- 获取刚才插入的 App ID
    select id into v_app_id from public.platform_apps where app_key = 'app_vr_core_001';
    
    if v_app_id is not null then
        -- 创建一个测试用户
        insert into public.platform_users (app_id, external_user_id, metadata)
        values (v_app_id, 'user_test_001', '{"nickname": "Test User"}'::jsonb)
        returning id into v_user_id;

        -- 插入一条 Token 消耗记录
        insert into public.platform_token_usage (app_id, platform_user_id, model_name, prompt_tokens, completion_tokens, total_tokens, cost_usd)
        values (v_app_id, v_user_id, 'gpt-4o', 100, 50, 150, 0.003);
    end if;
end $$;
