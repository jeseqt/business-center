import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Auth & Admin Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized', message: 'No authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
        console.error('Auth failed:', authError);
        return new Response(JSON.stringify({ error: 'Unauthorized', message: authError?.message || 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: admin } = await supabase.from('platform_admin_profiles').select('id').eq('id', user.id).single();
    if (!admin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    if (req.method === 'POST') {
      const { wallet_id, amount, type, description } = await req.json();
      
      // Get user_id from wallet_id
      const { data: wallet, error: walletError } = await supabase
        .from('platform_wallets')
        .select('user_id')
        .eq('id', wallet_id)
        .single();
        
      if (walletError || !wallet) throw new Error('Wallet not found');

      // Call RPC
      const { data, error } = await supabase.rpc('process_wallet_transaction', {
        _user_id: wallet.user_id,
        _amount: amount,
        _type: type || 'admin_adjustment',
        _description: description || `Admin adjustment by ${user.email}`,
        // _metadata: { operator_id: user.id } // RPC signature changed, removed metadata arg for simplicity or need to update RPC
      });

      if (error) throw error;

      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response('Method not allowed', { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
