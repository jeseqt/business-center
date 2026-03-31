import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth Check
    // Prioritize x-user-token if present (to bypass Gateway issues)
    let token = req.headers.get('x-user-token');
    
    if (token) {
        console.log('Using x-user-token for auth');
    } else {
        // Fallback to standard Authorization header
        token = req.headers.get('Authorization')?.replace('Bearer ', '');
    }

    if (!token) throw new Error('No authorization token provided');

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth failed:', authError);
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
      .select('*, platform_apps(name), platform_wallets(*)', { count: 'exact' });

    if (appId) query = query.eq('app_id', appId);
    if (keyword) {
      // Search in external_user_id OR email (in metadata) OR name (in metadata) OR account (new field) OR email (new field)
      query = query.or(`external_user_id.ilike.%${keyword}%,account.ilike.%${keyword}%,email.ilike.%${keyword}%,metadata->>email.ilike.%${keyword}%,metadata->>name.ilike.%${keyword}%`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data: users, count, error } = await query
      .range(from, to)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transform data to match legacy format
    const usersWithWallet = users.map((u: any) => {
        const wallet = Array.isArray(u.platform_wallets) 
          ? (u.platform_wallets.length > 0 ? u.platform_wallets[0] : null) 
          : (u.platform_wallets || null);
        return {
            ...u,
            _resolved_wallet: wallet,
            platform_wallets: undefined // Clean up to avoid confusion
        };
    });

    return new Response(
      JSON.stringify({ 
        data: usersWithWallet, 
        count 
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
