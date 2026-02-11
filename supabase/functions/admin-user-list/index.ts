import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token',
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
      .select('*, platform_apps(name)', { count: 'exact' });

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

    // Fetch wallets for these users
    let data = users;
    if (users && users.length > 0) {
        // 2024-05 Fix: 
        // We strictly distinguish between platform_users.id (App Profile ID) and external_user_id (Auth ID).
        // platform_wallets are bound to Auth ID (external_user_id).
        
        const authIds = users.map((u: any) => u.external_user_id);
        
        // Map to store AuthID -> Wallet
        const walletMap = new Map();

        if (authIds.length > 0) {
            // 1. Fetch existing wallets
            const { data: existingWallets, error: walletError } = await supabase
                .from('platform_wallets')
                .select('id, balance, currency, user_id')
                .in('user_id', authIds);
            
            if (!walletError && existingWallets) {
                existingWallets.forEach((w: any) => walletMap.set(w.user_id, w));
            }
        }

        // 2. Identify missing wallets
        // Users who have an Auth ID (external_user_id) but no wallet found
        const usersWithoutWallet = users.filter((u: any) => !walletMap.has(u.external_user_id));
        
        if (usersWithoutWallet.length > 0) {
            console.log(`Processing ${usersWithoutWallet.length} users without wallet linkage...`);
            
            // Process users sequentially
            for (const u of usersWithoutWallet) {
                const authId = u.external_user_id;
                
                // Skip if no valid auth id
                if (!authId) continue;
                
                let wallet = walletMap.get(authId);
                
                if (!wallet) {
                     // Check/Create Wallet with Correct Auth ID
                    const { data: existingWallet } = await supabase
                        .from('platform_wallets')
                        .select('id, balance, currency, user_id')
                        .eq('user_id', authId)
                        .maybeSingle();
                        
                    if (existingWallet) {
                        wallet = existingWallet;
                    } else {
                        // Auto-create wallet
                        console.log(`Auto-creating wallet for user: ${u.email} (AuthID: ${authId})`);
                        const { data: newWallet, error: createError } = await supabase
                            .from('platform_wallets')
                            .insert({
                                user_id: authId,
                                balance: 0,
                                currency: 'CNY'
                            })
                            .select('id, balance, currency, user_id')
                            .single();
                            
                        if (!createError && newWallet) {
                            wallet = newWallet;
                        } else {
                            // Ignore duplicate key error (race condition)
                            if (createError.code !== '23505') { 
                                console.error(`Failed to auto-create wallet for ${u.email}:`, createError);
                            }
                        }
                    }
                }
                
                if (wallet) {
                    walletMap.set(authId, wallet);
                    u._resolved_wallet = wallet;
                }
            }
        }

        // Merge wallet info
        data = users.map((u: any) => {
            let wallet = u._resolved_wallet;
            
            if (!wallet) {
                wallet = walletMap.get(u.external_user_id); // Lookup by Auth ID
            }
            
            return {
                ...u,
                platform_wallets: wallet ? {
                    id: wallet.id,
                    balance_permanent: wallet.balance,
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
