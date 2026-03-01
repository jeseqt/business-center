import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createSupabaseClient } from "../_shared/auth-middleware.ts";

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabase = createSupabaseClient();
    const payload = await req.json();
    
    // Mock Payload structure:
    // { "order_no": "MO123456", "status": "paid", "amount": 1000 }

    const { order_no, status, amount } = payload;

    if (!order_no || !status) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
    }

    if (status !== 'paid') {
      return new Response(JSON.stringify({ message: "Status not paid, ignoring" }), { status: 200 });
    }

    // 1. Find Order and associated User
    const { data: order, error: orderError } = await supabase
      .from('platform_orders')
      .select(`
        id, 
        amount, 
        status, 
        app_id, 
        platform_user_id,
        merchant_order_no,
        platform_users!inner(external_user_id)
      `)
      .eq('merchant_order_no', order_no)
      .single();

    if (orderError || !order) {
      console.error('Order not found:', order_no, orderError);
      return new Response(JSON.stringify({ error: "Order not found" }), { status: 404 });
    }

    if (order.status === 'paid') {
      return new Response(JSON.stringify({ message: "Order already processed" }), { status: 200 });
    }

    // Verify amount (BagelPay amount should match Order amount)
    // Assuming amount is integer (cents)
    if (order.amount !== amount) {
      console.error('Amount mismatch:', order.amount, amount);
      return new Response(JSON.stringify({ error: "Amount mismatch" }), { status: 400 });
    }

    // 2. Update Order Status
    const { error: updateError } = await supabase
      .from('platform_orders')
      .update({ 
        status: 'paid', 
        paid_at: new Date().toISOString(),
        channel: 'bagelpay' // Ensure channel is set correctly
      })
      .eq('id', order.id);

    if (updateError) {
      console.error('Failed to update order status:', updateError);
      return new Response(JSON.stringify({ error: "Database update failed" }), { status: 500 });
    }

    // 3. Credit Wallet
    // The RPC expects _user_id to be the Auth User ID (UUID), which is stored in external_user_id
    const externalUserId = order.platform_users.external_user_id;

    const { data: rpcResult, error: rpcError } = await supabase.rpc('process_wallet_transaction', {
      _user_id: externalUserId,
      _amount: amount, // Positive amount for deposit
      _type: 'deposit',
      _app_id: order.app_id,
      _order_id: order.id,
      _description: `Recharge via BagelPay: ${order.merchant_order_no}`
    });

    if (rpcError) {
      console.error('Wallet transaction failed:', rpcError);
      // Note: Order is marked as paid but wallet update failed. 
      // In production, this requires a transaction or a retry mechanism.
      // For now, we return 500.
      return new Response(JSON.stringify({ error: "Wallet transaction failed" }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, new_balance: rpcResult.new_balance }), { status: 200 });

  } catch (error: any) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
