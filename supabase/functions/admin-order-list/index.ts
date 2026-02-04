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

    // Auth Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: authError?.message || 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Admin Check
    const { data: adminProfile, error: adminError } = await supabase
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

    // Parse query params
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
    const appId = url.searchParams.get('app_id');
    const status = url.searchParams.get('status');
    const keyword = url.searchParams.get('keyword');

    let query = supabase
      .from('platform_orders')
      .select('*, platform_apps(name), platform_users(metadata)', { count: 'exact' });

    if (appId) query = query.eq('app_id', appId);
    if (status) query = query.eq('status', status);
    if (keyword) {
      query = query.or(`platform_order_no.ilike.%${keyword}%,merchant_order_no.ilike.%${keyword}%`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data: orders, count, error } = await query
      .range(from, to)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return new Response(
      JSON.stringify({ data: orders, count, page, pageSize }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
