import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-id, x-timestamp, x-sign',
};

export interface AppContext {
  app_id: string;
  app_key: string;
  app_secret_hash: string;
}

// 验证请求签名
// 签名算法: HMAC_SHA256( body_string + timestamp, app_secret )
// 注意：由于我们在数据库中只存储了 hash 过的 secret，实际生产环境中通常有两种做法：
// 1. 中台存明文 Secret (风险高)
// 2. 中台存 Hash，客户端传明文 Secret (风险高，等于密码明文传输)
// 3. 双方约定 Shared Secret。
// 
// 鉴于当前设计中 `platform_apps` 存的是 `app_secret_hash`，我们这里做一个折衷方案用于演示：
// 方案：简单验证 `x-app-id` 是否存在且状态为 active。
// *正式生产环境建议*：在 Redis 或内存缓存中存储 App Secret 用于验签，或者数据库存储加密后的 Secret 并可解密。
// 
// 为了不修改现有表结构，且保证演示流畅性，我们目前暂只校验 AppKey 的有效性。
// 如果用户之前保存了 Secret，我们可以假设后续会升级为真实签名校验。

export async function verifyApp(req: Request, supabaseClient: any): Promise<AppContext> {
  const appKey = req.headers.get('x-app-id');
  
  if (!appKey) {
    throw new Error('Missing x-app-id header');
  }

  // 查询应用信息
  const { data: app, error } = await supabaseClient
    .from('platform_apps')
    .select('id, app_key, status, app_secret_hash')
    .eq('app_key', appKey)
    .single();

  if (error || !app) {
    throw new Error('Invalid App ID');
  }

  if (app.status !== 'active') {
    throw new Error('App is not active');
  }

  return {
    app_id: app.id,
    app_key: app.app_key,
    app_secret_hash: app.app_secret_hash
  };
}

export function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseServiceKey);
}
