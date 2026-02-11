import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // Use service role key to perform admin actions
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Auth Check
    // Prioritize x-user-token if present
    let token = req.headers.get('x-user-token');
    if (!token) {
        token = req.headers.get('Authorization')?.replace('Bearer ', '');
    }

    if (!token) throw new Error('No authorization token provided');

    // Verify user (requester)
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Admin Check
    const { data: adminProfile, error: adminError } = await supabaseAdmin
      .from('platform_admin_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (adminError || !adminProfile) {
      return new Response(JSON.stringify({ 
        error: 'Forbidden',
        message: 'User is not an admin'
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { user_id, action } = await req.json();

    if (!user_id || !action) {
      return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`Processing action ${action} for user ${user_id} by admin ${user.id}`);

    if (action === 'toggle_lock') {
        // 1. Get current status
        const { data: targetUser, error: fetchError } = await supabaseAdmin
            .from('platform_users')
            .select('status')
            .eq('id', user_id)
            .single();
        
        if (fetchError || !targetUser) {
            throw new Error('User not found in platform_users');
        }

        const newStatus = targetUser.status === 'blocked' ? 'active' : 'blocked';
        const banDuration = newStatus === 'blocked' ? '876000h' : '0s'; // 100 years or 0

        // 2. Update platform_users
        const { error: updateError } = await supabaseAdmin
            .from('platform_users')
            .update({ status: newStatus })
            .eq('id', user_id);

        if (updateError) throw updateError;

        // 3. Update auth.users ban state
        // Note: Supabase Admin API uses updateUserById for bans
        const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(
            user_id,
            { ban_duration: banDuration }
        );

        if (banError) {
             console.error('Failed to update auth ban status:', banError);
             // Non-critical, but good to know
        }

        return new Response(JSON.stringify({ success: true, status: newStatus }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else if (action === 'delete') {
        // 0. Get external_user_id (auth.users.id) BEFORE deleting platform_user
        const { data: targetUser, error: fetchError } = await supabaseAdmin
            .from('platform_users')
            .select('external_user_id')
            .eq('id', user_id)
            .single();

        if (fetchError || !targetUser) {
             console.warn(`User ${user_id} not found in platform_users. It might have been already deleted.`);
             // If platform_user is gone, we can't get external_user_id easily unless we assume user_id matches (which is FALSE)
             // However, if the user clicked delete, they likely saw the user in the list.
             // If we can't find it, we return error, OR we assume it's already done.
             // Let's throw error for now to investigate if this happens.
             throw new Error('User not found in platform_users');
        }

        const authUserId = targetUser.external_user_id || user_id;

        // 1. Delete dependent data manually (safeguard against non-cascading FKs)
        // Note: platform_wallets uses user_id (Auth ID)
        await supabaseAdmin.from('platform_wallets').delete().eq('user_id', authUserId);
        try {
            await supabaseAdmin.from('platform_token_usage').delete().eq('platform_user_id', user_id);
        } catch (e) { console.warn('Failed to delete token usage', e); }
        
        try {
            await supabaseAdmin.from('platform_orders').delete().eq('platform_user_id', user_id);
        } catch (e) { console.warn('Failed to delete orders', e); }

        try {
            await supabaseAdmin.from('platform_user_invites').delete().eq('platform_user_id', user_id);
        } catch (e) { console.warn('Failed to delete invites', e); }
        
        // 2. Delete platform_user entry
        const { error: delPlatformError } = await supabaseAdmin
            .from('platform_users')
            .delete()
            .eq('id', user_id);
            
        if (delPlatformError) throw delPlatformError;

        // 3. Delete auth user
        const { error: delAuthError } = await supabaseAdmin.auth.admin.deleteUser(
            authUserId
        );

        if (delAuthError) {
             console.error('Failed to delete auth user:', delAuthError);
             // Return 200 with warning? Or 500?
             // If platform user is deleted, the main goal is achieved for the admin panel.
             // We can return success but log the error.
             // throw delAuthError; 
        }

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else {
        return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', message: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
