-- 20260224000002_fix_permissions_and_schema.sql
-- 目的：
-- 1. 确保所有注册用户都是管理员（开发环境便利措施）
-- 2. 确保 platform_admin_profiles 表存在
-- 3. 再次确认 platform_apps 表结构完整

-- 1. 确保 platform_admin_profiles 表存在
create table if not exists public.platform_admin_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    role text default 'admin' check (role in ('super_admin', 'admin', 'viewer')),
    created_at timestamptz default now()
);

-- RLS for admin profiles
alter table public.platform_admin_profiles enable row level security;
drop policy if exists "Admins can view admin profiles" on public.platform_admin_profiles;
create policy "Admins can view admin profiles" on public.platform_admin_profiles
    for select using (true); -- 允许所有认证用户查看（简化开发环境权限）

-- 2. 将所有现有用户设为超级管理员
insert into public.platform_admin_profiles (id, role, display_name)
select id, 'super_admin', email
from auth.users
on conflict (id) do nothing;

-- 3. 确保 platform_apps 表结构完整 (再次确认)
ALTER TABLE public.platform_apps 
ADD COLUMN IF NOT EXISTS invite_required boolean DEFAULT false;

ALTER TABLE public.platform_apps 
ADD COLUMN IF NOT EXISTS app_secret text;

ALTER TABLE public.platform_apps 
ADD COLUMN IF NOT EXISTS app_secret_hash text;
