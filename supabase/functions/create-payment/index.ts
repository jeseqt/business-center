
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-key',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Validate App Key
    const appKey = req.headers.get('x-app-key')
    if (!appKey) {
      throw new Error('Missing x-app-key header')
    }

    const { data: appData, error: appError } = await supabaseClient
      .from('platform_apps')
      .select('id, status')
      .eq('app_key', appKey)
      .single()

    if (appError || !appData) {
      return new Response(
        JSON.stringify({ error: 'Invalid App Key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Parse Body
    const { 
        merchant_order_no, 
        external_user_id, 
        amount, 
        currency = 'CNY',
        channel = 'mock',
        product_info 
    } = await req.json()

    if (!merchant_order_no || !amount || !external_user_id) {
        throw new Error('Missing required fields')
    }

    // 3. Get Platform User
    const { data: userData } = await supabaseClient
        .from('platform_users')
        .select('id')
        .eq('app_id', appData.id)
        .eq('external_user_id', external_user_id)
        .maybeSingle()
    
    // Auto-create user if not exists (for payment flow simplicity)
    let platformUserId = userData?.id
    if (!platformUserId) {
         const { data: newUser } = await supabaseClient
            .from('platform_users')
            .insert({
                app_id: appData.id,
                external_user_id: external_user_id
            })
            .select('id')
            .single()
         platformUserId = newUser?.id
    }

    // 4. Create Order
    const platformOrderNo = `PO${Date.now()}${Math.floor(Math.random()*1000)}`
    
    const { data: order, error: orderError } = await supabaseClient
        .from('platform_orders')
        .insert({
            app_id: appData.id,
            platform_user_id: platformUserId,
            merchant_order_no,
            platform_order_no: platformOrderNo,
            amount,
            currency,
            channel,
            status: 'pending',
            product_info
        })
        .select()
        .single()

    if (orderError) throw orderError

    // 5. Generate Mock Payment URL
    // In production, this would call WeChat/Alipay/Stripe API
    const payUrl = `https://platform.voice-reflect.com/pay/cashier?order=${platformOrderNo}`

    return new Response(
      JSON.stringify({ 
          success: true, 
          data: {
              platform_order_no: platformOrderNo,
              pay_url: payUrl,
              status: 'pending'
          }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
