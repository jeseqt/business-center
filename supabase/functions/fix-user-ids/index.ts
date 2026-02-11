import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch all Auth Users
    // Warning: This is a heavy operation for large user bases. 
    // For this specific repair task, we assume < 10000 users.
    let allUsers: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const { data: { users }, error } = await supabase.auth.admin.listUsers({
            page: page,
            perPage: 1000
        });
        
        if (error) throw error;
        
        if (users && users.length > 0) {
            allUsers = [...allUsers, ...users];
            page++;
        } else {
            hasMore = false;
        }
    }

    console.log(`Fetched ${allUsers.length} auth users.`);

    // 2. Iterate and Update platform_users
    let updatedCount = 0;
    let errors: any[] = [];

    for (const user of allUsers) {
        if (!user.email) continue;

        // Check if platform_user exists with this email but WRONG external_user_id
        const { data: platformUsers, error: fetchError } = await supabase
            .from('platform_users')
            .select('id, external_user_id, email')
            .eq('email', user.email);

        if (fetchError) {
            errors.push({ email: user.email, error: fetchError });
            continue;
        }

        if (platformUsers && platformUsers.length > 0) {
            for (const pUser of platformUsers) {
                // If ID doesn't match, update it
                if (pUser.external_user_id !== user.id) {
                    console.log(`Fixing ID for ${user.email}: ${pUser.external_user_id} -> ${user.id}`);
                    
                    const { error: updateError } = await supabase
                        .from('platform_users')
                        .update({ external_user_id: user.id })
                        .eq('id', pUser.id); // Update by PK to be safe

                    if (updateError) {
                        errors.push({ email: user.email, error: updateError });
                    } else {
                        updatedCount++;
                    }
                }
            }
        }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        total_auth_users: allUsers.length,
        updated_platform_users: updatedCount,
        errors: errors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
