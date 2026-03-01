import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, createSupabaseClient } from "../_shared/auth-middleware.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();

    // 1. Authenticate User (Bearer Token)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    // 2. Parse Body
    const { amount, app_id } = await req.json();

    if (!amount || amount <= 0) {
      throw new Error('Invalid amount');
    }
    
    if (!app_id) {
        throw new Error('Missing app_id');
    }

    // 3. Verify User belongs to App
    const { data: platformUser, error: platformUserError } = await supabase
      .from('platform_users')
      .select('id')
      .eq('app_id', app_id)
      .eq('external_user_id', user.id)
      .single();

    if (platformUserError || !platformUser) {
      throw new Error('User not registered in this app context');
    }

    // 4. Create Order
    // 转换为分 (cents)
    const amountCents = Math.round(amount * 100);

    const platformOrderNo = `PO${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const merchantOrderNo = `MO${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const orderData = {
      app_id: app_id,
      platform_user_id: platformUser.id,
      amount: amountCents,
      currency: 'USD',
      status: 'pending',
      platform_order_no: platformOrderNo,
      merchant_order_no: merchantOrderNo,
      channel: 'bagelpay',
      metadata: {
        recharge_amount_usd: amount
      }
    };

    const { data: order, error: orderError } = await supabase
      .from('platform_orders')
      .insert(orderData)
      .select()
      .single();

    if (orderError) {
      console.error('Order creation failed', orderError);
      throw new Error('Order creation failed: ' + orderError.message);
    }

    // 5. Integrate with BagelPay (Mock)
    // Construct URLs
    // For production, these should be environment variables
    const PROJECT_REF = 'cozklbnjwqqtwibwzszg';
    const FUNCTION_BASE_URL = `https://${PROJECT_REF}.supabase.co/functions/v1`;
    const WEBHOOK_URL = `${FUNCTION_BASE_URL}/bagelpay-webhook`;
    
    // TODO: Update return_url to production URL when available
    const RETURN_URL = 'http://localhost:5173/dashboard/wallet?status=success';

    const paymentUrl = `https://mock-bagelpay.com/pay?order_no=${merchantOrderNo}&amount=${amountCents}&currency=USD&return_url=${encodeURIComponent(RETURN_URL)}&webhook_url=${encodeURIComponent(WEBHOOK_URL)}`;
    
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          order_id: order.id,
          merchant_order_no: merchantOrderNo,
          amount: amount,
          payment_url: paymentUrl
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
