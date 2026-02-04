import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders, createErrorResponse, createSuccessResponse } from "../_shared/response.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Setup Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Auth Check (Must be admin)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return createErrorResponse('Unauthorized', 401);
    }

    const { data: adminProfile } = await supabase
      .from('platform_admin_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!adminProfile) {
      return createErrorResponse('Forbidden: Admin access required', 403);
    }

    // 3. Parse Body
    const { app_id, email, password, account } = await req.json();

    if (!email || !password || !app_id) {
      return createErrorResponse('Missing required fields: email, password, app_id', 400);
    }

    // 4. Create User in Supabase Auth
    // Note: This creates a user in the global Auth instance. 
    // If you need app-specific isolation, you'd typically use distinct projects or metadata.
    const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        account: account || email.split('@')[0],
        app_id: app_id
      }
    });

    if (createError) {
      console.error('Failed to create auth user:', createError);
      return createErrorResponse('Failed to create user in Auth system: ' + createError.message, 400);
    }

    if (!authUser.user) {
      return createErrorResponse('Failed to create user: No user returned', 500);
    }

    // 5. Create User Record in platform_users
    // platform_users.external_user_id maps to auth.users.id
    const { data: platformUser, error: dbError } = await supabase
      .from('platform_users')
      .insert({
        app_id: app_id,
        external_user_id: authUser.user.id,
        email: email,
        account: account || email.split('@')[0],
        metadata: {
          source: 'admin_portal_create',
          created_by: user.id
        },
        status: 'active'
      })
      .select()
      .single();

    if (dbError) {
      console.error('Failed to create platform user record:', dbError);
      // Optional: Rollback auth user creation? 
      // await supabase.auth.admin.deleteUser(authUser.user.id);
      return createErrorResponse('User created in Auth but failed to create profile: ' + dbError.message, 500);
    }

    // 6. Initialize Wallet (Optional but recommended)
    // Check if wallet already exists (triggered by DB trigger?) or create one manually
    // Assuming platform_wallets is auto-created or we need to create it.
    // Based on previous code, let's try to create a wallet if it doesn't exist.
    
    // Check for existing wallet
    const { data: existingWallet } = await supabase
        .from('platform_wallets')
        .select('id')
        .eq('user_id', authUser.user.id)
        .single();

    if (!existingWallet) {
        await supabase.from('platform_wallets').insert({
            user_id: authUser.user.id,
            balance: 0,
            currency: 'CNY'
        });
    }

    return createSuccessResponse({
      user: platformUser,
      auth_id: authUser.user.id
    });

  } catch (err: any) {
    console.error('Unexpected error:', err);
    return createErrorResponse(err.message || 'Internal Server Error', 500);
  }
});
