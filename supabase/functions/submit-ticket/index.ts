import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ----------------------------------------------------------------------------
// Shared Code (Inlined for Web Editor Deployment)
// ----------------------------------------------------------------------------

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-id, x-timestamp, x-sign',
};

export function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function verifyApp(req: Request, supabaseClient: any) {
  const appKey = req.headers.get('x-app-id');
  
  if (!appKey) {
    throw new Error('Missing x-app-id header');
  }

  // 查询应用信息
  const { data: app, error } = await supabaseClient
    .from('platform_apps')
    .select('id, app_key, status, app_secret_hash')
    .eq('app_key', appKey)
    .single();

  if (error || !app) {
    throw new Error('Invalid App ID');
  }

  if (app.status !== 'active') {
    throw new Error('App is not active');
  }

  return {
    app_id: app.id,
    app_key: app.app_key,
    app_secret_hash: app.app_secret_hash
  };
}

// ----------------------------------------------------------------------------
// Main Function Logic
// ----------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const appContext = await verifyApp(req, supabase);
    const { app_id } = appContext;

    if (req.method === 'POST') {
      // Create Ticket
      const { title, description, contact_email, category = 'other', priority = 'normal', external_user_id } = await req.json();

      if (!title || !description) {
        throw new Error('Title and description are required');
      }

      const { data, error } = await supabase
        .from('platform_app_tickets')
        .insert({
          app_id,
          title,
          description,
          contact_email,
          category,
          priority,
          external_user_id,
          status: 'open'
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (req.method === 'GET') {
      // List Tickets for this App (Optional: Filter by external_user_id)
      const url = new URL(req.url);
      const external_user_id = url.searchParams.get('external_user_id');

      let query = supabase
        .from('platform_app_tickets')
        .select('*')
        .eq('app_id', app_id)
        .order('created_at', { ascending: false });

      if (external_user_id) {
        query = query.eq('external_user_id', external_user_id);
      }

      const { data, error } = await query;
      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`Method ${req.method} not supported`);

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
