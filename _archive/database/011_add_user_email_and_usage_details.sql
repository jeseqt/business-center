-- ==============================================================================
-- 描述: 为 platform_users 添加 email 字段，为 platform_token_usage 添加方法名及中文解释
-- ==============================================================================

-- 1. 修改 platform_users 表，添加 email 字段
alter table public.platform_users 
add column if not exists email text;

-- 添加索引以加快邮箱搜索
create index if not exists idx_platform_users_email on public.platform_users(email);

-- 2. 修改 platform_token_usage 表，添加 method_name 和 method_label
alter table public.platform_token_usage 
add column if not exists method_name text, -- 方法名，如 'chat', 'audio_transcription'
add column if not exists method_label text; -- 中文解释，如 '对话', '语音转文字'

-- 3. (可选) 如果需要回填历史数据的默认值，可以在这里添加 update 语句
-- 例如: update public.platform_token_usage set method_name = 'unknown' where method_name is null;
