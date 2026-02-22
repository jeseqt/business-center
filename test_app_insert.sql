INSERT INTO public.platform_apps (name, app_key, app_secret_hash, invite_required) 
VALUES ('Test App', 'ak_test_123', 'hash_123', true) 
ON CONFLICT (app_key) DO UPDATE SET invite_required = true
RETURNING id, app_key;