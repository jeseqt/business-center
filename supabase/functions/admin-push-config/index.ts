
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

console.log("Hello from admin-push-config!");

serve(async (req) => {
  // 1. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 2. Initialize Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Auth Check (User must be logged in)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Admin Check (User must be an admin)
    const { data: adminProfile } = await supabase
      .from('platform_admin_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!adminProfile) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Parse Request Body
    const { app_id, config_key, config_value } = await req.json();

    if (!app_id || !config_key || !config_value) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: app_id, config_key, config_value' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Fetch App Details (webhook_url, app_secret, app_key)
    const { data: app, error: appError } = await supabase
      .from('platform_apps')
      .select('app_key, app_secret, webhook_url')
      .eq('id', app_id)
      .single();

    if (appError || !app) {
      return new Response(
        JSON.stringify({ error: 'App not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!app.webhook_url) {
      return new Response(
        JSON.stringify({ error: 'Webhook URL not configured for this app' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!app.app_secret) {
        return new Response(
          JSON.stringify({ error: 'App Secret not found for this app' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // 7. Construct Payload and Sign
    // Format: { config_key, config_value }
    const payload = {
      config_key,
      config_value
    };
    
    const bodyString = JSON.stringify(payload);
    const timestamp = Date.now().toString();
    
    // HMAC-SHA256 Signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(app.app_secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(bodyString + timestamp)
    );
    
    const signHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    console.log(`Pushing config to ${app.webhook_url} for app ${app.app_key}`);

    // 8. Send Request to Webhook
    const response = await fetch(app.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': app.app_key, // Using app_key as x-app-id as per convention (or should it be ID?)
        // The docs say: "x-app-id | Diffuse Reflect's App ID (consistent with BC_APP_ID) | 945dc2a8..."
        // In platform_apps, app_key is usually the client-facing ID. Let's assume app_key.
        'x-timestamp': timestamp,
        'x-sign': signHex,
      },
      body: bodyString,
    });

    // 9. Handle Response
    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!response.ok) {
      console.error('Webhook failed:', response.status, responseText);
      return new Response(
        JSON.stringify({ 
          error: `Webhook failed with status ${response.status}`, 
          details: responseData 
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, webhook_response: responseData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in admin-push-config:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
