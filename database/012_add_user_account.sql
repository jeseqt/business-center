-- 添加 account 字段到 platform_users 表
alter table public.platform_users 
add column if not exists account text;

-- 为 account 添加索引
create index if not exists idx_platform_users_account on public.platform_users(account);
