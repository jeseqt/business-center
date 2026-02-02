import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // This API is public or called by service role
    // We expect { app_id, code, external_user_id }
    const { app_id, code, external_user_id } = await req.json();

    if (!app_id || !code || !external_user_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 1. Resolve Platform User ID
    const { data: user, error: userError } = await supabase
      .from('platform_users')
      .select('id')
      .eq('app_id', app_id)
      .eq('external_user_id', external_user_id)
      .single();

    if (userError || !user) {
       return new Response(JSON.stringify({ error: 'User not found in platform' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Call Redeem RPC
    const { data: result, error: rpcError } = await supabase.rpc('redeem_invite_code', {
      _app_id: app_id,
      _code: code,
      _platform_user_id: user.id
    });

    if (rpcError) throw rpcError;

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
