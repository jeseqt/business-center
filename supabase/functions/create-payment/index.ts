import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, verifyApp, createSupabaseClient } from "../_shared/auth-middleware.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();

    // 1. Verify App
    const appContext = await verifyApp(req, supabase);
    const { app_id } = appContext;

    // 2. Authenticate User (Bearer Token)
    // 支付接口必须要求用户登录
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    // 3. Find Platform User ID
    // 必须确保该用户已在 platform_users 表中注册（client-auth login 接口已保证这点）
    const { data: platformUser, error: platformUserError } = await supabase
      .from('platform_users')
      .select('id')
      .eq('app_id', app_id)
      .eq('external_user_id', user.id)
      .single();

    if (platformUserError || !platformUser) {
      throw new Error('User not registered in this app context');
    }

    // 4. Parse Body
    const { amount, product_info, channel = 'mock' } = await req.json();

    if (!amount || amount <= 0) {
      throw new Error('Invalid amount');
    }

    // 5. Create Order
    // 生成内部订单号
    const platformOrderNo = `PO${Date.now()}${Math.floor(Math.random() * 1000)}`;
    // 模拟商户订单号 (如果客户端没传)
    const merchantOrderNo = `MO${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const orderData = {
      app_id: app_id,
      platform_user_id: platformUser.id,
      amount: amount,
      currency: 'CNY',
      status: 'pending', // 待支付
      platform_order_no: platformOrderNo,
      merchant_order_no: merchantOrderNo,
      metadata: {
        product_info,
        channel
      }
    };

    const { data: order, error: orderError } = await supabase
      .from('platform_orders')
      .insert(orderData)
      .select()
      .single();

    if (orderError) {
      console.error('Order creation failed', orderError);
      throw new Error('Order creation failed');
    }

    // 6. Mock Payment Gateway
    // 在真实场景中，这里会调用微信/支付宝统一下单接口
    // 这里我们直接模拟返回一个支付链接或参数
    let paymentResponse;
    if (channel === 'mock') {
       // Mock: 直接返回成功模拟
       paymentResponse = {
         pay_url: `https://mock-payment.com/pay?order=${platformOrderNo}`,
         mock_success_tip: "In real mode, redirect user to pay_url"
       };
    } else {
       paymentResponse = {
         tip: "Channel not implemented yet, verify using mock channel"
       };
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          order_id: order.id,
          platform_order_no: platformOrderNo,
          amount: amount,
          status: 'pending',
          payment: paymentResponse
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
