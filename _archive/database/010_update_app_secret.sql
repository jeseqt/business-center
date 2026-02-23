-- ==============================================================================
-- 更新 Voice Reflect 应用密钥
-- ==============================================================================

-- 开启 pgcrypto 扩展 (如果尚未开启)
create extension if not exists pgcrypto;

do $$
declare
    -- 从 .env 获取的 App Key
    v_app_key text := 'ak_0b8ea443e5194076b454c8387c2d763d'; 
    v_secret text := 'sk_live_-z6jvhuKq1g6CJ5oyUXyK8tkjpXlbyRO';
begin
    -- 更新 App Secret 和 Hash
    update public.platform_apps
    set 
        app_secret = v_secret,
        app_secret_hash = encode(digest(v_secret, 'sha256'), 'hex'),
        updated_at = now()
    where app_key = v_app_key;
    
    -- 打印结果 (仅在 SQL 客户端可见)
    raise notice 'Updated secret for app %', v_app_key;
end $$;
