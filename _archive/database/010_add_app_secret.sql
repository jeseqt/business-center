-- 20240204_add_app_secret.sql
-- 目的：为了支持 API 签名校验，服务端需要能够获取 App Secret。
-- 注意：生产环境中，该字段应当加密存储 (e.g., using PGP or Vault)，或者使用专门的密钥管理服务。
-- 本次为了演示完整流程，添加明文/可逆字段，仅管理员/Service Role 可见。

ALTER TABLE public.platform_apps 
ADD COLUMN IF NOT EXISTS app_secret text;

-- 只有 Service Role 和 Admin 可以查看 app_secret
-- 更新 RLS 策略 (如果需要细粒度控制，可以单独设策略，但目前 "Admins can view apps" 已经覆盖了 select *)
-- 确保普通用户无法读取 (当前 platform_apps 只对 admin 开放，所以是安全的)
