-- 20260224000000_add_ticket_system.sql
-- Based on database/007_ticket_system.sql
-- Fixes trigger function name from update_modified_column to handle_updated_at

create extension if not exists "uuid-ossp";

-- 7.1 工单主表
create table if not exists public.platform_app_tickets (
    id uuid primary key default gen_random_uuid(),
    app_id uuid not null references public.platform_apps(id) on delete cascade,
    platform_user_id uuid references public.platform_users(id) on delete set null,
    
    -- 外部用户ID (如果未关联 platform_users)
    external_user_id text,
    contact_email text,
    
    title text not null,
    description text not null,
    
    -- 分类: bug, feature, billing, other
    category text default 'other',
    
    -- 优先级: high, normal, low
    priority text default 'normal',
    
    -- 状态: open, in_progress, resolved, closed
    status text default 'open',
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 7.2 工单回复表
create table if not exists public.platform_app_ticket_replies (
    id uuid primary key default gen_random_uuid(),
    ticket_id uuid not null references public.platform_app_tickets(id) on delete cascade,
    
    -- 发送者类型: 'user' (用户), 'admin' (客服/管理员)
    sender_type text not null check (sender_type in ('user', 'admin')),
    
    -- 如果是 admin，记录是哪个管理员 (可选)
    admin_id uuid,
    
    content text not null,
    
    -- 附件链接 (JSON 数组)
    attachments jsonb default '[]'::jsonb,
    
    created_at timestamptz default now()
);

-- 索引
create index if not exists idx_tickets_app_status on public.platform_app_tickets(app_id, status);
create index if not exists idx_ticket_replies_ticket on public.platform_app_ticket_replies(ticket_id, created_at);

-- RLS
alter table public.platform_app_tickets enable row level security;
alter table public.platform_app_ticket_replies enable row level security;

-- Admin 策略 (简化版: 允许 Authenticated 用户/管理员操作)
drop policy if exists "Admins can manage tickets" on public.platform_app_tickets;
create policy "Admins can manage tickets" on public.platform_app_tickets for all using (auth.role() = 'authenticated');

drop policy if exists "Admins can manage replies" on public.platform_app_ticket_replies;
create policy "Admins can manage replies" on public.platform_app_ticket_replies for all using (auth.role() = 'authenticated');

-- 触发器: 更新工单 updated_at
-- Use handle_updated_at() instead of update_modified_column()
drop trigger if exists on_platform_app_tickets_updated on public.platform_app_tickets;
create trigger on_platform_app_tickets_updated
  before update on public.platform_app_tickets
  for each row execute procedure public.handle_updated_at();
