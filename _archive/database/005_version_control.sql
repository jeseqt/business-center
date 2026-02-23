-- ==============================================================================
-- 5. 版本管理 (Version Control)
-- ==============================================================================

create table if not exists public.platform_app_versions (
    id uuid primary key default uuid_generate_v4(),
    app_id uuid not null references public.platform_apps(id) on delete cascade,
    
    -- 平台类型
    platform text not null check (platform in ('ios', 'android', 'web', 'macos', 'windows')),
    
    -- 版本号 (语义化版本, e.g. '1.0.0')
    version_name text not null,
    
    -- 版本代码 (用于比较大小, e.g. 100)
    version_code int not null,
    
    -- 更新内容 (支持 Markdown 或纯文本)
    update_content text,
    
    -- 下载/跳转链接
    download_url text,
    
    -- 是否强制更新
    is_force_update boolean default false,
    
    -- 状态: 'active' (当前可检测到的最新版), 'archived' (历史版本), 'draft' (草稿)
    -- 通常同一个平台只会有一个 active 版本，或者逻辑上取 version_code 最大的 active 版本
    status text default 'active' check (status in ('active', 'archived', 'draft')),
    
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    
    -- 联合唯一: 同一个 App 同一个平台版本号不能重复
    unique(app_id, platform, version_code)
);

-- 索引
create index idx_versions_app_plat_code on public.platform_app_versions(app_id, platform, version_code desc);

-- RLS 策略
alter table public.platform_app_versions enable row level security;

-- 管理员可全权管理
create policy "Admins can manage versions" on public.platform_app_versions
    for all using (is_platform_admin());

-- 触发器 (自动更新 updated_at)
create trigger on_platform_app_versions_updated
  before update on public.platform_app_versions
  for each row execute procedure public.handle_updated_at();
