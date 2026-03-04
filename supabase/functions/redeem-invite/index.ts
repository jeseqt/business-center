import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { code, app_id, required_type } = await req.json();

    if (!code || !app_id) {
        return new Response(JSON.stringify({ error: 'Missing code or app_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get Platform User ID
    // We need to find the platform_user_id corresponding to the auth user
    // Since platform_users links via external_user_id (which is auth.uid())
    const { data: platformUser, error: platformError } = await supabaseAdmin
        .from('platform_users')
        .select('id')
        .eq('external_user_id', user.id)
        .eq('app_id', app_id)
        .maybeSingle();

    if (platformError || !platformUser) {
        console.error('Platform user not found for user:', user.id, 'app:', app_id);
        // Fallback: Try to find ANY platform user for this external_user_id if app_id mismatch?
        // But RPC requires app_id match for invite code.
        return new Response(JSON.stringify({ error: 'User profile not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Call RPC
    const { data: result, error: rpcError } = await supabaseAdmin.rpc('redeem_invite_code', {
        _app_id: app_id,
        _code: code,
        _platform_user_id: platformUser.id,
        _required_type: required_type || null
    });

    if (rpcError) {
        console.error('RPC Error:', rpcError);
        throw rpcError;
    }

    if (!result.success) {
        return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, message: 'Invite code redeemed successfully', data: result.data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('redeem-invite error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
