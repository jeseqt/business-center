import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, verifyApp, createSupabaseClient } from "../_shared/auth-middleware.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createSupabaseClient();

    // 1. Verify App & Signature
    // This is a server-to-server API, so we enforce signature verification
    const appContext = await verifyApp(req, supabase, { requireSignature: true });
    // Note: verifyApp returns { app_id (uuid), app_key, ... }
    // But the request body also contains `app_id` (likely the UUID or Key?).
    // Let's rely on the authenticated app_id from verifyApp.

    const reqClone = req.clone();
    const { code, external_user_id } = await reqClone.json();

    if (!code || !external_user_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Resolve Platform User ID
    const { data: user, error: userError } = await supabase
      .from('platform_users')
      .select('id')
      .eq('app_id', appContext.app_id)
      .eq('external_user_id', external_user_id)
      .single();

    if (userError || !user) {
       return new Response(JSON.stringify({ error: 'User not found in platform' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Call Redeem RPC
    const { data: result, error: rpcError } = await supabase.rpc('redeem_invite_code', {
      _app_id: appContext.app_id,
      _code: code,
      _platform_user_id: user.id
    });

    if (rpcError) throw rpcError;

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
