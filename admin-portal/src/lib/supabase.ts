import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 检查配置是否有效（非空且非默认占位符）
const isConfigured = supabaseUrl && 
                     supabaseAnonKey && 
                     supabaseUrl !== 'your_supabase_project_url' &&
                     !supabaseUrl.includes('your_supabase_project_url');

let client;

try {
  // 使用假值防止 createClient 在初始化时崩溃
  const clientUrl = isConfigured ? supabaseUrl : 'https://placeholder.supabase.co'
  const clientKey = isConfigured ? supabaseAnonKey : 'placeholder-key'
  client = createClient(clientUrl, clientKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  })
} catch (error) {
  console.error('Supabase client initialization failed:', error)
  // 发生错误时使用占位符初始化，防止应用白屏崩溃
  client = createClient('https://placeholder.supabase.co', 'placeholder-key')
}

export const supabase = client
export const isSupabaseConfigured = isConfigured
