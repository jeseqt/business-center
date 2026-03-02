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
    const token = authHeader.replace(/^Bearer /i, '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ 
            error: `Invalid user token: ${userError?.message || 'User not found'}`,
            debug: {
                token_prefix: token.substring(0, 10) + '...',
                error_details: userError
            }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // 2. Parse request body
    const { amount, app_id, return_url, product_id } = await req.json();

    if (!app_id) {
        throw new Error('Missing app_id');
    }
    
    // Debug info for type checking
    console.log(`Debug types: user.id=${typeof user.id} (${user.id}), app_id=${typeof app_id} (${app_id})`);

    // 3. Verify User belongs to App
    const { data: platformUser, error: platformUserError } = await supabase
      .from('platform_users')
      .select('id, external_user_id')
      .eq('app_id', app_id)
      .eq('external_user_id', user.id)
      .maybeSingle(); // 使用 maybeSingle 避免 .single() 在找不到时报错

    if (platformUserError) {
        console.error('Platform User Query Error:', platformUserError);
        throw new Error(`Database error querying user: ${platformUserError.message}`);
    }

    if (!platformUser) {
        // 如果找不到用户，尝试只用 external_user_id 查一下，看是不是 app_id 不匹配
        const { data: userAnyApp } = await supabase
            .from('platform_users')
            .select('app_id')
            .eq('external_user_id', user.id)
            .limit(1)
            .maybeSingle();
            
        console.error(`User not found for app_id: ${app_id}. User exists in app: ${userAnyApp?.app_id || 'none'}`);
        
        throw new Error(`User not registered for this app (app_id: ${app_id}). Please refresh dashboard.`);
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
      // Helper to convert to snake_case
      const toSnakeCase = (obj: any) => {
        const newObj: any = {};
        for (const key in obj) {
          const newKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
          newObj[newKey] = obj[key];
        }
        return newObj;
      };

      const isTestMode = Deno.env.get('BAGELPAY_TEST_MODE') !== 'false';
      const baseUrl = isTestMode ? 'https://test.bagelpay.io' : 'https://live.bagelpay.io';

      // 1. Ensure we have a product_id
      if (!bagelPayProductId) {
        console.log('No pre-defined product ID. Creating dynamic product...');
        const createProductUrl = `${baseUrl}/api/products/create`;
        
        const productPayload = {
          name: finalProductName,
          description: finalProductDesc,
          price: finalAmount,
          currency: 'USD',
          billingType: 'single_payment',
          taxInclusive: true,
          taxCategory: 'digital_products',
          recurringInterval: null,
          trialDays: 0
        };

        const productResponse = await fetch(createProductUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': bagelPayApiKey
          },
          body: JSON.stringify(toSnakeCase(productPayload))
        });

        if (!productResponse.ok) {
           const errText = await productResponse.text();
           console.error('Failed to create dynamic product:', errText);
           throw new Error('Payment provider error: Failed to create dynamic product. ' + errText);
        }

        const productData = await productResponse.json();
        const productResult = productData.data || productData;
        bagelPayProductId = productResult.product_id;
        console.log('Created dynamic product:', bagelPayProductId);
      }

      // 2. Create Checkout
      const checkoutUrlEndpoint = `${baseUrl}/api/payments/checkouts`;
      
      const checkoutPayload = {
        productId: bagelPayProductId,
        requestId: merchantOrderNo,
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
        successUrl: successUrl
      };

      console.log(`Calling BagelPay Checkout API: ${checkoutUrlEndpoint}`, JSON.stringify(toSnakeCase(checkoutPayload)));

      const checkoutResponse = await fetch(checkoutUrlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': bagelPayApiKey
        },
        body: JSON.stringify(toSnakeCase(checkoutPayload))
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
