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
      console.error('Auth error:', userError);
      throw new Error('Invalid user token');
    }

    // 2. Parse Body
    const { amount, app_id, return_url, product_id } = await req.json();

    if (!app_id) {
        throw new Error('Missing app_id');
    }

    // 3. Verify User belongs to App
    const { data: platformUser, error: platformUserError } = await supabase
      .from('platform_users')
      .select('id, external_user_id')
      .eq('app_id', app_id)
      .eq('external_user_id', user.id)
      .single();

    if (platformUserError || !platformUser) {
      console.error('Platform user check failed:', platformUserError);
      throw new Error('User not registered in this app context');
    }

    // 4. Resolve Product Info
    let finalAmount = amount;
    let finalProductName = `Recharge $${amount}`;
    let finalProductDesc = `Wallet recharge for App: ${app_id}`;
    let bagelPayProductId = null;
    let points = Math.floor(amount || 0); // Default points = amount for dynamic

    if (product_id) {
      const { data: product, error: productError } = await supabase
        .from('recharge_products')
        .select('*')
        .eq('id', product_id)
        .single();
      
      if (productError || !product) {
        console.error('Product lookup failed:', productError);
        throw new Error('Invalid product_id');
      }
      
      finalAmount = Number(product.amount);
      finalProductName = product.name;
      finalProductDesc = product.description || finalProductDesc;
      bagelPayProductId = product.bagelpay_product_id;
      points = product.points;
    } else {
      if (!amount || amount <= 0) {
        throw new Error('Invalid amount');
      }
    }

    // 5. Create Order
    // 转换为分 (cents)
    const amountCents = Math.round(finalAmount * 100);

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
        recharge_amount_usd: finalAmount,
        points: points,
        product_id: product_id
      },
      product_info: {
        name: finalProductName,
        description: finalProductDesc,
        amount_usd: finalAmount
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

    // 6. Integrate with BagelPay (Real API) or Mock
    const bagelPayApiKey = Deno.env.get('BAGELPAY_API_KEY');
    
    // Construct return URL
    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';
    let successUrl = return_url || `${appUrl}/dashboard/wallet?status=success`;
    
    // Append order_no to success_url
    try {
      const urlObj = new URL(successUrl);
      urlObj.searchParams.set('order_no', merchantOrderNo);
      successUrl = urlObj.toString();
    } catch (e) {
      const separator = successUrl.includes('?') ? '&' : '?';
      successUrl = `${successUrl}${separator}order_no=${merchantOrderNo}`;
    }

    let checkoutUrl = '';

    if (!bagelPayApiKey) {
      console.warn('Missing BAGELPAY_API_KEY. Using MOCK payment mode.');
      
      // MOCK MODE: Auto-complete payment
      // 1. Update Order Status
      await supabase
        .from('platform_orders')
        .update({ 
          status: 'paid', 
          paid_at: new Date().toISOString(),
          channel: 'mock',
          bagelpay_checkout_id: `mock_${Date.now()}`
        })
        .eq('id', order.id);

      // 2. Credit Wallet
      const { data: rpcResult, error: rpcError } = await supabase.rpc('process_wallet_transaction', {
        _user_id: user.id, // Auth User ID
        _amount: amountCents,
        _type: 'deposit',
        _app_id: app_id,
        _order_id: order.id,
        _description: `Mock Recharge: ${merchantOrderNo}`
      });

      if (rpcError) {
        console.error('Mock wallet transaction failed:', rpcError);
        // Note: In mock mode we might still want to redirect even if wallet fails, 
        // or throw error. Let's log it.
      }

      // 3. Return Success URL as Payment URL (Instant Redirect)
      checkoutUrl = successUrl;
      
    } else {
      // REAL BAGELPAY MODE
      const isTestMode = Deno.env.get('BAGELPAY_TEST_MODE') !== 'false';
      const bagelPayUrl = isTestMode
        ? 'https://test.bagelpay.io/api/payments/checkouts'
        : 'https://live.bagelpay.io/api/payments/checkouts';

      // Base payload with common fields
      const basePayload = {
        request_id: merchantOrderNo, // Restore request_id as per doc
        customer: {
          email: user.email || 'customer@example.com'
        },
        metadata: {
          user_id: user.id,
          platform_user_id: platformUser.id,
          order_id: order.id,
          order_no: merchantOrderNo,
          app_id: app_id
        },
        success_url: successUrl
      };

      let requestBody: any = { ...basePayload };

      // If we have a pre-defined product in BagelPay, use it exclusively
      if (bagelPayProductId) {
        requestBody.product_id = bagelPayProductId;
      } else {
        // Dynamic pricing flow
        requestBody.amount = {
          value: amountCents,
          currency: 'USD'
        };
        requestBody.product = {
          name: finalProductName,
          description: finalProductDesc
        };
      }

      console.log(`Calling BagelPay API: ${bagelPayUrl}`, JSON.stringify(requestBody));

      const checkoutResponse = await fetch(bagelPayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': bagelPayApiKey
        },
        body: JSON.stringify(requestBody)
      });

      if (!checkoutResponse.ok) {
        const errorText = await checkoutResponse.text();
        console.error('BagelPay API error:', errorText);
        
        // Update order to failed
        await supabase
          .from('platform_orders')
          .update({ status: 'failed' })
          .eq('id', order.id);

        throw new Error('Payment service unavailable: ' + errorText);
      }

      const checkoutData = await checkoutResponse.json();
      console.log('BagelPay checkout created:', checkoutData);

      const checkoutResult = checkoutData.data || checkoutData;
      // Try multiple field names for the checkout URL
      checkoutUrl = checkoutResult.checkout_url || checkoutResult.url || checkoutResult.hosted_url || checkoutResult.payment_url;
      const paymentId = checkoutResult.payment_id || checkoutResult.id || checkoutResult.checkout_id;

      if (!checkoutUrl) {
        console.error('BagelPay response missing checkout_url:', checkoutData);
        throw new Error(`Payment provider returned invalid response (missing checkout_url). Response: ${JSON.stringify(checkoutData)}`);
      }

      // Update order with BagelPay details
      await supabase
        .from('platform_orders')
        .update({
          bagelpay_checkout_id: paymentId,
          bagelpay_session_url: checkoutUrl
        })
        .eq('id', order.id);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          order_id: order.id,
          merchant_order_no: merchantOrderNo,
          amount: finalAmount,
          payment_url: checkoutUrl
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Create recharge order error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
