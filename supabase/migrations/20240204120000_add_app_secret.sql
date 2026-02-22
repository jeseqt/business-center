-- 20240204_add_app_secret.sql
-- 目的：为了支持 API 签名校验，服务端需要能够获取 App Secret。

ALTER TABLE public.platform_apps 
ADD COLUMN IF NOT EXISTS app_secret text;
