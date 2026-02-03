import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, verifyApp, createSupabaseClient } from "../_shared/auth-middleware.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();

    // 1. Verify App (Middleware) - optional but good for tracking
    const appContext = await verifyApp(req, supabase);
    
    // 2. Authenticate User
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) throw new Error('Invalid user token');

    // 3. Get Wallet Balance
    if (req.method === 'GET') {
      const { data: wallet, error: walletError } = await supabase
        .from('platform_wallets')
        .select('id, balance, currency, updated_at')
        .eq('user_id', user.id)
        .single();

      if (walletError && walletError.code !== 'PGRST116') { // PGRST116 is "No rows found"
         throw walletError;
      }

      // If no wallet exists, return 0 balance
      const result = wallet || {
        balance: 0,
        currency: 'CNY',
        updated_at: null
      };

      return new Response(
        JSON.stringify({ success: true, data: result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // 4. Get Transactions
    if (req.method === 'POST') {
       // Typically GET with query params is better, but POST allows complex filters
       const { page = 1, limit = 20 } = await req.json();
       
       // Find wallet first
       const { data: wallet } = await supabase
         .from('platform_wallets')
         .select('id')
         .eq('user_id', user.id)
         .single();
         
       if (!wallet) {
          return new Response(
            JSON.stringify({ success: true, data: [] }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
       }

       const from = (page - 1) * limit;
       const to = from + limit - 1;

       const { data: transactions, error: txError, count } = await supabase
         .from('platform_wallet_transactions')
         .select('*', { count: 'exact' })
         .eq('wallet_id', wallet.id)
         .order('created_at', { ascending: false })
         .range(from, to);

       if (txError) throw txError;

       return new Response(
         JSON.stringify({ 
           success: true, 
           data: transactions,
           meta: {
             page,
             limit,
             total: count
           }
         }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
    }

    return new Response('Method not allowed', { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
