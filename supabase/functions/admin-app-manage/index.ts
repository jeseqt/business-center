import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateSecret() {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  // Simple base64url-like encoding
  const base64 = btoa(String.fromCharCode(...array)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return 'sk_live_' + base64;
}

async function hashSecret(secret: string) {
  const msgUint8 = new TextEncoder().encode(secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Auth Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    // 2. Admin Check
    const { data: adminProfile } = await supabase
      .from('platform_admin_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!adminProfile) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Handle Requests
    if (req.method === 'POST') {
      const { name, description } = await req.json();

      if (!name) throw new Error('App Name is required');

      const app_key = 'ak_' + crypto.randomUUID().replace(/-/g, '');
      const app_secret = generateSecret();
      const app_secret_hash = await hashSecret(app_secret);

      const { data, error } = await supabase
        .from('platform_apps')
        .insert({
          name,
          description,
          app_key,
          app_secret_hash,
          app_secret, // Store secret for signature verification
          status: 'active'
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ 
          data: {
            ...data,
            app_secret // Return secret ONLY once
          } 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } 
    
    else if (req.method === 'PUT') {
      // Handle regenerate secret
      const { app_id, action } = await req.json();
      
      if (action === 'regenerate_secret') {
         if (!app_id) throw new Error('App ID is required');
         
         const new_secret = generateSecret();
         const new_hash = await hashSecret(new_secret);
         
         const { data, error } = await supabase
           .from('platform_apps')
           .update({ 
             app_secret_hash: new_hash,
             app_secret: new_secret // Update stored secret
           })
           .eq('id', app_id)
           .select()
           .single();
           
         if (error) throw error;
         
         return new Response(
            JSON.stringify({ 
              data: {
                id: app_id,
                new_app_secret: new_secret 
              } 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
      }
      
      throw new Error('Invalid action');
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
