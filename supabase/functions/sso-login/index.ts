import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, createSupabaseClient } from "../_shared/auth-middleware.ts";
import { verifySignature } from "../_shared/crypto.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const { sso_token, sso_sign, timestamp, redirectTo } = await req.json();

    if (!sso_token || !sso_sign || !timestamp) {
      throw new Error('sso_token, sso_sign, and timestamp are required');
    }

    // 1. Validate timestamp (within 5 minutes)
    const now = Date.now();
    const reqTime = parseInt(timestamp);
    if (isNaN(reqTime) || Math.abs(now - reqTime) > 5 * 60 * 1000) {
       throw new Error('Request expired');
    }

    // 2. Decode sso_token (base64 encoded JSON)
    let base64 = sso_token.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const decodedPayload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64), c => c.charCodeAt(0))));
    const { app_id, email, account } = decodedPayload;

    if (!app_id || !email) {
      throw new Error('Token must contain app_id and email');
    }

    // 3. Fetch app_secret for the given app_id
    const { data: appData, error: appError } = await supabase
      .from('platform_apps')
      .select('app_secret')
      .eq('id', app_id)
      .single();

    if (appError || !appData || !appData.app_secret) {
      throw new Error('Invalid app_id or app_secret missing');
    }

    // 4. Verify signature
    // Payload for signature: sso_token + timestamp
    const payloadToSign = sso_token + timestamp;
    const isValid = await verifySignature(appData.app_secret, payloadToSign, sso_sign);
    
    if (!isValid) {
        throw new Error('Invalid signature');
    }

    // 5. User management (Find or Create)
    // We try to get the user by email via admin API
    let userId: string;

    const { data: existingUsers, error: listUserError } = await supabase.auth.admin.listUsers();
    if (listUserError) throw listUserError;
    const existingUser = existingUsers?.users?.find((u: any) => u.email === email);

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create user if not exists
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
            account: account || email.split('@')[0],
            app_id: app_id
        }
      });
      if (authError) throw authError;
      userId = authData.user.id;

      // Ensure platform_users and wallet exist
      const { data: platformUser, error: platformError } = await supabase
        .from('platform_users')
        .insert({
          app_id: app_id,
          external_user_id: userId,
          email: email,
          account: account || email.split('@')[0],
          metadata: { email, source: 'sso_login' }
        })
        .select()
        .single();
      
      if (!platformError && platformUser) {
        await supabase
          .from('platform_wallets')
          .insert({
              app_id: app_id,
              platform_user_id: platformUser.id,
              balance_permanent: 0,
              balance_temporary: 0
          });
      }
    }

    // Generate Magic Link for the user
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: redirectTo || (req.headers.get('origin') || 'http://localhost:5173')
      }
    });

    if (linkError) throw linkError;

    // linkData.properties.action_link contains the URL with #access_token=...
    return new Response(
      JSON.stringify({ 
        action_link: linkData.properties.action_link,
        user_id: userId,
        email: email
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
