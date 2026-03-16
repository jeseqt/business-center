-- Migration to add platform_app_configs and platform_app_notifications tables
-- Based on archived designs from 004_config_center.sql and 006_notification_center.sql

-- ==============================================================================
-- 1. platform_app_configs
-- ==============================================================================

create table if not exists public.platform_app_configs (
    id uuid primary key default gen_random_uuid(),
    app_id uuid not null references public.platform_apps(id) on delete cascade,
    
    -- Config Key (e.g., 'welcome_message', 'feature_flags')
    config_key text not null,
    -- Config Value (supports JSON objects, arrays, or simple values)
    config_value jsonb not null default '{}'::jsonb,
    
    -- Environment (e.g., 'production', 'development', 'staging')
    environment text default 'production',
    
    -- Description
    description text,
    
    -- Is Active
    is_active boolean default true,
    
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    
    -- Unique constraint: Key must be unique per App per Environment
    unique(app_id, environment, config_key)
);

-- Indexes
create index if not exists idx_configs_app_env on public.platform_app_configs(app_id, environment);

-- RLS Policies
alter table public.platform_app_configs enable row level security;

-- Admins can manage configs (using existing is_platform_admin function)
create policy "Admins can manage configs" on public.platform_app_configs
    for all using (is_platform_admin());

-- Trigger for updated_at (using existing handle_updated_at function)
create trigger on_platform_app_configs_updated
  before update on public.platform_app_configs
  for each row execute procedure public.handle_updated_at();


-- ==============================================================================
-- 2. platform_app_notifications
-- ==============================================================================

create table if not exists public.platform_app_notifications (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.platform_apps(id) on delete cascade,
  title text not null,
  content text not null,
  type text not null default 'announcement', -- announcement, maintenance, promotion
  priority text not null default 'normal', -- high, normal, low
  start_time timestamptz not null default now(),
  end_time timestamptz, -- null means forever
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_notifications_app_id on public.platform_app_notifications(app_id);
create index if not exists idx_notifications_time on public.platform_app_notifications(start_time, end_time);

-- RLS Policies
alter table public.platform_app_notifications enable row level security;

-- Public read access for active notifications (refined from original design)
-- Allowing public read access as notifications are typically public facing
create policy "Public read access for notifications"
  on public.platform_app_notifications for select
  using (true);

-- Admins can manage all notifications (refined to use is_platform_admin for security)
create policy "Admins can manage all notifications"
  on public.platform_app_notifications for all
  using (is_platform_admin());

-- Trigger for updated_at
create trigger update_platform_app_notifications_modtime
  before update on public.platform_app_notifications
  for each row execute procedure public.handle_updated_at();
