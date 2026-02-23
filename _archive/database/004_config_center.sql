-- ==============================================================================
-- 4. 配置中心 (Config Center)
-- ==============================================================================

create table if not exists public.platform_app_configs (
    id uuid primary key default uuid_generate_v4(),
    app_id uuid not null references public.platform_apps(id) on delete cascade,
    
    -- 配置键 (如: 'welcome_message', 'feature_flags')
    config_key text not null,
    -- 配置值 (支持 JSON 对象、数组或简单值)
    config_value jsonb not null default '{}'::jsonb,
    
    -- 环境 (如: 'production', 'development', 'staging')
    environment text default 'production',
    
    -- 描述说明
    description text,
    
    -- 是否启用
    is_active boolean default true,
    
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    
    -- 联合唯一约束: 同一个 App 在同一个环境下 key 必须唯一
    unique(app_id, environment, config_key)
);

-- 索引
create index idx_configs_app_env on public.platform_app_configs(app_id, environment);

-- RLS 策略
alter table public.platform_app_configs enable row level security;

-- 管理员可全权管理
create policy "Admins can manage configs" on public.platform_app_configs
    for all using (is_platform_admin());

-- 触发器 (自动更新 updated_at)
create trigger on_platform_app_configs_updated
  before update on public.platform_app_configs
  for each row execute procedure public.handle_updated_at();
