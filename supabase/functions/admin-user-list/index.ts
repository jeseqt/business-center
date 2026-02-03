import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      console.error('Auth failed:', authError);
      throw new Error('Unauthorized: ' + (authError?.message || 'Invalid token'));
    }

    // Admin Check
    const { data: adminProfile, error: adminError } = await supabase
      .from('platform_admin_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (adminError || !adminProfile) {
      console.error('Admin check failed for user:', user.id, adminError);
      return new Response(JSON.stringify({ 
        error: 'Forbidden',
        message: 'User is not an admin',
        user_id: user.id,
        debug_error: adminError
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Parse query params
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
    const appId = url.searchParams.get('app_id');
    const keyword = url.searchParams.get('keyword'); // Generic search

    let query = supabase
      .from('platform_users')
      .select('*, platform_apps(name)', { count: 'exact' });

    if (appId) query = query.eq('app_id', appId);
    if (keyword) {
      // Search in external_user_id OR email (in metadata) OR name (in metadata)
      query = query.or(`external_user_id.ilike.%${keyword}%,metadata->>email.ilike.%${keyword}%,metadata->>name.ilike.%${keyword}%`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data: users, count, error } = await query
      .range(from, to)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch wallets for these users
    let data = users;
    if (users && users.length > 0) {
        // platform_users.external_user_id corresponds to auth.users.id
        // platform_wallets.user_id corresponds to auth.users.id
        const userIds = users.map((u: any) => u.external_user_id).filter((id: string) => !!id);
        
        // Use global wallet table
        const { data: wallets } = await supabase
            .from('platform_wallets')
            .select('id, balance, currency, user_id')
            .in('user_id', userIds);
            
        // Merge wallet info
        data = users.map((u: any) => {
            const wallet = wallets?.find((w: any) => w.user_id === u.external_user_id);
            return {
                ...u,
                platform_wallets: wallet ? {
                    id: wallet.id,
                    balance_permanent: wallet.balance, // Map new balance to old field name for frontend compatibility
                    balance_temporary: 0
                } : null
            };
        });
    }

    return new Response(
      JSON.stringify({ data, count, page, pageSize }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
