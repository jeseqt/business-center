import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Auth & Admin Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized: No auth header');
    
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) {
      console.error('User Auth Failed:', userError);
      throw new Error('Unauthorized: ' + (userError?.message || 'Invalid token'));
    }

    console.log(`Checking admin privileges for user: ${user.id}`);
    const { data: admin, error: adminError } = await supabase.from('platform_admin_profiles').select('id').eq('id', user.id).single();
    
    if (adminError || !admin) {
      console.error('Admin check failed:', adminError);
      return new Response(JSON.stringify({ 
        error: 'Forbidden', 
        message: 'User is not in admin group',
        user_id: user.id,
        debug_error: adminError
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const appId = url.searchParams.get('app_id');
      const page = parseInt(url.searchParams.get('page') || '1');
      const pageSize = 20;
      
      let query = supabase.from('platform_invite_codes').select('*', { count: 'exact' });
      if (appId) query = query.eq('app_id', appId);
      
      const { data, count, error } = await query
        .range((page - 1) * pageSize, page * pageSize - 1)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify({ data, count }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (req.method === 'POST') {
      const { app_id, count = 1, valid_days = 30, max_usage = 1 } = await req.json();
      if (!app_id) throw new Error('app_id is required');

      const codes: any[] = [];
      const batchSize = Math.min(count, 100);
      const expiresAt = valid_days ? new Date(Date.now() + valid_days * 86400000).toISOString() : null;

      // Simple loop for generation
      for (let i = 0; i < batchSize; i++) {
        codes.push({
          app_id,
          code: generateInviteCode(),
          valid_days,
          max_usage,
          expires_at: expiresAt,
          created_by: user.id
        });
      }

      const { data, error } = await supabase.from('platform_invite_codes').insert(codes).select();
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, count: data.length, data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    return new Response('Method not allowed', { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
