-- ==============================================================================
-- 修复邀请码 Schema 补充脚本
-- ==============================================================================

-- 注意：用户已明确要求邀请码必须归属特定 App，不使用全局邀请码。
-- 因此，我们不修改 platform_invite_codes 表的 app_id 为可空。
-- app_id 保持 NOT NULL (schema 003 中定义)。

-- 1. 补充 View 以方便查询用户与钱包关系 (用于 Admin User List)
-- 由于 platform_wallets 现在关联 auth.users，而 platform_users 也关联 auth.users。
-- 我们可以创建一个 View 来简化前端/Admin查询。

create or replace view public.view_user_wallets as
select 
    u.id as platform_user_id,
    u.app_id,
    u.user_id as auth_user_id,
    u.metadata,
    u.created_at,
    w.id as wallet_id,
    w.balance,
    w.currency
from public.platform_users u
left join public.platform_wallets w on u.user_id = w.user_id;

-- 授权 View 访问
grant select on public.view_user_wallets to service_role;
