import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifySignature } from './crypto.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-id, x-timestamp, x-sign',
};

export interface AppContext {
  app_id: string;
  app_key: string;
  app_secret_hash: string;
}

export interface VerifyAppOptions {
  requireSignature?: boolean;
}

// 验证请求签名
// 签名算法: HMAC_SHA256( body_string + timestamp, app_secret )
export async function verifyApp(
  req: Request, 
  supabaseClient: any, 
  options: VerifyAppOptions = {}
): Promise<AppContext> {
  const { requireSignature = false } = options;
  const appKey = req.headers.get('x-app-id');
  const signature = req.headers.get('x-sign');
  const timestamp = req.headers.get('x-timestamp');
  
  if (!appKey) {
    throw new Error('Missing x-app-id header');
  }

  // 查询应用信息
  const { data: app, error } = await supabaseClient
    .from('platform_apps')
    .select('id, app_key, status, app_secret_hash, app_secret')
    .eq('app_key', appKey)
    .single();

  if (error || !app) {
    throw new Error('Invalid App ID');
  }

  if (app.status !== 'active') {
    throw new Error('App is not active');
  }

  // 签名校验逻辑
  if (requireSignature) {
    if (!signature || !timestamp) {
      throw new Error('Missing signature headers (x-sign, x-timestamp)');
    }
  }

  // 如果存在签名头，总是尝试校验（即使 requireSignature=false）
  // 这样可以允许客户端自愿提供签名来增加安全性
  if (signature && timestamp) {
    // 1. 验证时间戳 (5分钟内有效)
    const now = Date.now();
    const reqTime = parseInt(timestamp);
    if (isNaN(reqTime) || Math.abs(now - reqTime) > 5 * 60 * 1000) {
       throw new Error('Request expired');
    }

    if (!app.app_secret) {
        console.warn(`App ${appKey} has no secret stored. Cannot verify signature.`);
        // 如果强制要求签名，但服务端没 Secret，必须报错
        if (requireSignature) {
           throw new Error('Server configuration error: missing app secret');
        }
    } else {
        // 2. 读取 Body 用于验签
        const reqClone = req.clone();
        const bodyText = await reqClone.text();
        const payload = bodyText + timestamp;

        const isValid = await verifySignature(app.app_secret, payload, signature);
        if (!isValid) {
            throw new Error('Invalid Signature');
        }
    }
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
