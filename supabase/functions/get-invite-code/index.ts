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

    // Use Service Role to bypass RLS for creating invite codes
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log(`[get-invite-code] User: ${user.id}`);

    // Get user's App ID from platform_users
    // Try user_id first (standard), then external_user_id
    let { data: platformUser, error: puError } = await supabaseAdmin
      .from('platform_users')
      .select('app_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!platformUser) {
        const { data: pu2 } = await supabaseAdmin
            .from('platform_users')
            .select('app_id')
            .eq('external_user_id', user.id)
            .maybeSingle();
        if (pu2) platformUser = pu2;
    }

    if (puError && !platformUser) {
        console.error('Platform user error:', puError);
    }

    if (!platformUser) {
      console.error(`Platform user not found for ${user.id}`);
      return new Response(JSON.stringify({ error: 'Platform user not found', userId: user.id }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const appId = platformUser.app_id;
    console.log(`[get-invite-code] App ID: ${appId}`);

    // Check existing invite code
    const { data: existingCode, error: fetchError } = await supabaseAdmin
      .from('platform_invite_codes')
      .select('code')
      .eq('created_by', user.id)
      .eq('app_id', appId)
      .eq('status', 'active')
      .maybeSingle();
    
    if (fetchError) {
        console.error('Error fetching existing code:', fetchError);
    }

    // Check if user has already redeemed a code
    const { data: redeemedData } = await supabaseAdmin
        .from('platform_global_user_invites')
        .select('invite_code_id, platform_invite_codes(code)')
        .eq('user_id', user.id)
        .maybeSingle();
    
    const redeemedCode = (redeemedData as any)?.platform_invite_codes?.code || null;

    if (existingCode) {
      return new Response(JSON.stringify({ code: existingCode.code, redeemed_code: redeemedCode }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Generate new code
    let newCode = '';
    let lastError = null;

    for (let i = 0; i < 5; i++) {
        // Random 6 char alphanumeric (exclude confusing chars like I, O, 0, 1)
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let j = 0; j < 6; j++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        // Try insert
        const { error: insertError } = await supabaseAdmin
            .from('platform_invite_codes')
            .insert({
                app_id: appId,
                code: result,
                type: 'activity',
                created_by: user.id,
                max_usage: null, // Unlimited
                status: 'active'
            });
            
        if (!insertError) {
            newCode = result;
            break;
        }
        console.warn(`Invite code insert failed for ${result}:`, insertError);
        lastError = insertError;
        
        // If not unique violation, break
        if (insertError.code !== '23505') {
            break;
        }
    }

    if (!newCode) {
        console.error('Failed to generate invite code. Last error:', lastError);
        throw new Error(`Failed to generate unique invite code: ${lastError?.message || 'Unknown error'}`);
    }

    return new Response(JSON.stringify({ code: newCode, redeemed_code: redeemedCode }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('get-invite-code error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
