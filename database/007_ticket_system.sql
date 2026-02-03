-- ==============================================================================
-- 7. 工单系统 (Ticket System)
-- ==============================================================================

-- 7.1 工单主表
create table if not exists public.platform_app_tickets (
    id uuid primary key default uuid_generate_v4(),
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
    id uuid primary key default uuid_generate_v4(),
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
create index idx_tickets_app_status on public.platform_app_tickets(app_id, status);
create index idx_ticket_replies_ticket on public.platform_app_ticket_replies(ticket_id, created_at);

-- RLS
alter table public.platform_app_tickets enable row level security;
alter table public.platform_app_ticket_replies enable row level security;

-- Admin 策略 (简化版: 允许 Authenticated 用户/管理员操作)
create policy "Admins can manage tickets" on public.platform_app_tickets for all using (auth.role() = 'authenticated');
create policy "Admins can manage replies" on public.platform_app_ticket_replies for all using (auth.role() = 'authenticated');

-- 触发器: 更新工单 updated_at
create trigger on_platform_app_tickets_updated
  before update on public.platform_app_tickets
  for each row execute procedure update_modified_column();
