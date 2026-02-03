
-- Create function for updating timestamp
create or replace function update_modified_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- Create platform_app_notifications table
create table if not exists public.platform_app_notifications (
  id uuid primary key default uuid_generate_v4(),
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

-- Enable RLS
alter table public.platform_app_notifications enable row level security;

-- Policies
create policy "Public read access for active notifications via API"
  on public.platform_app_notifications for select
  using (true);

create policy "Admins can manage all notifications"
  on public.platform_app_notifications for all
  using (auth.role() = 'authenticated');

-- Indexes
create index idx_notifications_app_id on public.platform_app_notifications(app_id);
create index idx_notifications_time on public.platform_app_notifications(start_time, end_time);

-- Trigger for updated_at
create trigger update_platform_app_notifications_modtime
  before update on public.platform_app_notifications
  for each row execute procedure update_modified_column();
