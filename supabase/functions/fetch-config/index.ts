import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ----------------------------------------------------------------------------
// Shared Code (Inlined for Web Editor Deployment)
// ----------------------------------------------------------------------------

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-id, x-timestamp, x-sign',
};

export function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function verifyApp(req: Request, supabaseClient: any) {
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

// ----------------------------------------------------------------------------
// Main Function Logic
// ----------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();

    // 1. Verify App (Client Auth)
    const appContext = await verifyApp(req, supabase);
    const { app_id } = appContext;

    // 2. Parse Query Params
    const url = new URL(req.url);
    const keys = url.searchParams.get('keys')?.split(',').filter(k => k) || [];
    const environment = url.searchParams.get('env') || 'production';

    // 3. Query Configs
    let query = supabase
      .from('platform_app_configs')
      .select('config_key, config_value')
      .eq('app_id', app_id)
      .eq('environment', environment)
      .eq('is_active', true);

    if (keys.length > 0) {
      query = query.in('config_key', keys);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Fetch config error', error);
      throw error;
    }

    // 4. Transform to Map: { "key": "value" }
    const configMap: Record<string, any> = {};
    data?.forEach((item: any) => {
      configMap[item.config_key] = item.config_value;
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: configMap,
        meta: {
          env: environment,
          count: data?.length || 0
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
