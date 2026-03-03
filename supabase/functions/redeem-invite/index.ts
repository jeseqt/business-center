import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const INVITE_REWARD = 20;

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

    const { code, app_id } = await req.json();

    if (!code || !app_id) {
        return new Response(JSON.stringify({ error: 'Missing code or app_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Validate Invite Code
    const { data: invite, error: inviteError } = await supabaseAdmin
        .from('platform_invite_codes')
        .select('*')
        .eq('code', code)
        .eq('app_id', app_id) // Must match app
        .eq('status', 'active')
        .maybeSingle();
    
    if (inviteError || !invite) {
        return new Response(JSON.stringify({ error: 'Invalid invite code' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Check if self-invite
    if (invite.created_by === user.id) {
        return new Response(JSON.stringify({ error: 'Cannot redeem your own code' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Check if already used ANY invite code (One-time only per user)
    const { data: existingUsage, error: usageError } = await supabaseAdmin
        .from('platform_global_user_invites')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

    if (existingUsage) {
        return new Response(JSON.stringify({ error: 'You have already redeemed an invite code' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 4. Record Usage
    const { error: recordError } = await supabaseAdmin
        .from('platform_global_user_invites')
        .insert({
            invite_code_id: invite.id,
            user_id: user.id
        });

    if (recordError) {
        console.error('Record usage error:', recordError);
        return new Response(JSON.stringify({ error: 'Failed to redeem code' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 5. Update Usage Count
    await supabaseAdmin
        .from('platform_invite_codes')
        .update({ current_usage: (invite.current_usage || 0) + 1 })
        .eq('id', invite.id);

    // 6. Return Success (Reward will be given on first recharge)
    return new Response(JSON.stringify({ success: true, message: 'Invite code redeemed successfully' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('redeem-invite error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
