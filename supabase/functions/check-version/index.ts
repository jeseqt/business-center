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

    // 1. Verify App
    const appContext = await verifyApp(req, supabase);
    const { app_id } = appContext;

    // 2. Parse Query
    const url = new URL(req.url);
    const platform = url.searchParams.get('platform');
    const currentVersionCode = parseInt(url.searchParams.get('version_code') || '0');

    if (!platform) {
      throw new Error('Missing platform parameter');
    }

    // 3. Find Latest Active Version
    const { data: latestVersion, error } = await supabase
      .from('platform_app_versions')
      .select('*')
      .eq('app_id', app_id)
      .eq('platform', platform)
      .eq('status', 'active')
      .order('version_code', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows found"
      console.error('Check version failed', error);
      throw new Error('Check version failed');
    }

    if (!latestVersion) {
      // No active version found
      return new Response(
        JSON.stringify({
          success: true,
          data: { has_update: false }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Compare Versions
    const hasUpdate = latestVersion.version_code > currentVersionCode;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          has_update: hasUpdate,
          latest: hasUpdate ? {
            version_name: latestVersion.version_name,
            version_code: latestVersion.version_code,
            update_content: latestVersion.update_content,
            download_url: latestVersion.download_url,
            is_force_update: latestVersion.is_force_update
          } : null
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
