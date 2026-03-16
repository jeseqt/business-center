-- Migration to add platform_app_versions table
-- Based on archived design from 005_version_control.sql

-- ==============================================================================
-- 1. platform_app_versions
-- ==============================================================================

create table if not exists public.platform_app_versions (
    id uuid primary key default gen_random_uuid(),
    app_id uuid not null references public.platform_apps(id) on delete cascade,
    
    -- Platform Type
    platform text not null check (platform in ('ios', 'android', 'web', 'macos', 'windows')),
    
    -- Version Name (Semantic Versioning, e.g. '1.0.0')
    version_name text not null,
    
    -- Version Code (For comparison, e.g. 100)
    version_code int not null,
    
    -- Update Content (Markdown supported)
    update_content text,
    
    -- Download/Redirect URL
    download_url text,
    
    -- Is Force Update
    is_force_update boolean default false,
    
    -- Status: 'active' (current latest), 'archived' (history), 'draft' (preparing)
    status text default 'active' check (status in ('active', 'archived', 'draft')),
    
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    
    -- Unique constraint: Same App, Same Platform, Same Version Code must be unique
    unique(app_id, platform, version_code)
);

-- Indexes
create index if not exists idx_versions_app_plat_code on public.platform_app_versions(app_id, platform, version_code desc);

-- RLS Policies
alter table public.platform_app_versions enable row level security;

-- Public read access for active versions (for clients checking updates)
create policy "Public read access for active versions"
  on public.platform_app_versions for select
  using (status = 'active');

-- Admins can manage all versions
create policy "Admins can manage versions"
  on public.platform_app_versions for all
  using (is_platform_admin());

-- Trigger for updated_at
create trigger on_platform_app_versions_updated
  before update on public.platform_app_versions
  for each row execute procedure public.handle_updated_at();
