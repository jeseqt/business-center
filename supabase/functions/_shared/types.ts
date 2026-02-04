// 核心数据模型 (对应数据库表结构)

export type AppStatus = 'active' | 'suspended' | 'development';

export interface PlatformApp {
  id: string;
  name: string;
  description: string | null;
  app_key: string;
  app_secret_hash: string;
  // app_secret 仅在创建时返回，或者在某些特定管理接口返回
  app_secret?: string; 
  webhook_url: string | null;
  status: AppStatus;
  daily_token_limit: number | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformUser {
  id: string;
  app_id: string;
  external_user_id: string;
  metadata: Record<string, any>;
  status: 'active' | 'blocked';
  created_at: string;
  last_active_at: string | null;
}

export interface PlatformTokenUsage {
  id: string;
  app_id: string;
  platform_user_id: string | null;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  request_metadata: Record<string, any>;
  created_at: string;
  updated_at?: string; // Add if needed
}

// 统一 API 响应结构
export interface ApiResponse<T = any> {
  success: boolean;
  code?: number;      // 业务错误码
  message?: string;   // 错误信息或提示信息
  data?: T;           // 成功时的数据
  trace_id?: string;  // 请求追踪 ID
}
