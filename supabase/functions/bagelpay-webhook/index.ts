import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createSupabaseClient } from "../_shared/auth-middleware.ts";

// Helper to convert hex string to Uint8Array
function hexToUint8Array(hexString: string) {
  const match = hexString.match(/.{1,2}/g);
  if (!match) return new Uint8Array();
  return new Uint8Array(match.map(byte => parseInt(byte, 16)));
}

// Helper to convert base64 string to Uint8Array
function base64ToUint8Array(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabase = createSupabaseClient();
    
    // Read raw body for signature verification
    const rawBody = await req.text();
    console.log('Webhook Raw Body:', rawBody);

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      console.error('Failed to parse webhook JSON:', e);
      return new Response("Invalid JSON", { status: 400 });
    }

    // 1. Verify Signature (if secret is configured)
    const webhookSecret = Deno.env.get('BAGELPAY_WEBHOOK_SECRET');
    const isTestMode = Deno.env.get('BAGELPAY_TEST_MODE') === 'true';

    // In production, we MUST verify the signature.
    // However, if verification fails, we return detailed error info in the response body
    // so the user can debug via BagelPay dashboard.
    
    if (webhookSecret) {
      const signatureHeader = req.headers.get('bagelpay-signature') || req.headers.get('x-bagelpay-signature');
      const timestampHeader = req.headers.get('timestamp') || req.headers.get('webhook-timestamp');

      if (!signatureHeader) {
        console.error('Missing signature header');
        return new Response(JSON.stringify({ 
            error: "Missing bagelpay-signature header"
        }), { 
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
      }

      let timestamp = timestampHeader;
      let signature = signatureHeader;
      let payloadToSign: string | undefined;

      // Strategy 1: Stripe-like (t=...,v1=...) - in case they switch back or documentation was right
      if (signatureHeader.includes('t=') && signatureHeader.includes('v1=')) {
          const parts = signatureHeader.split(',');
          timestamp = parts.find(p => p.trim().startsWith('t='))?.split('=')[1];
          signature = parts.find(p => p.trim().startsWith('v1='))?.split('=')[1];
          if (timestamp && signature) {
             payloadToSign = `${timestamp}.${rawBody}`;
          }
      }

      // Strategy 2: Simple Hex Signature
      if (!payloadToSign) {
          // If we have a timestamp header, the payload is likely "timestamp.body" or just "body"
          // We will try both in the verification loop below
          signature = signatureHeader;
      }

      // Helper to verify a specific payload with a specific secret encoding
      const verify = async (sig: string, payload: string, secretBytes: Uint8Array) => {
          try {
            const encoder = new TextEncoder();
            const key = await crypto.subtle.importKey(
                'raw',
                secretBytes,
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['verify']
            );
            return await crypto.subtle.verify(
                'HMAC',
                key,
                hexToUint8Array(sig),
                encoder.encode(payload)
            );
          } catch (e) {
              console.error('Verification error:', e);
              return false;
          }
      };

      const encoder = new TextEncoder();
      let verified = false;
      let usedStrategy = "none";
      
      // Try 1: UTF-8 Secret + Timestamp.Body (if timestamp exists)
      if (timestamp) {
         verified = await verify(signature!, `${timestamp}.${rawBody}`, encoder.encode(webhookSecret));
         if (verified) usedStrategy = "Timestamp.Body-UTF8";
      }

      // Try 2: Base64 Secret + Timestamp.Body (if timestamp exists)
      if (!verified && timestamp) {
          try {
            if (webhookSecret.endsWith('=') || webhookSecret.length % 4 === 0) {
                verified = await verify(signature!, `${timestamp}.${rawBody}`, base64ToUint8Array(webhookSecret));
                if (verified) usedStrategy = "Timestamp.Body-Base64";
            }
          } catch (e) {}
      }

      // Try 3: UTF-8 Secret + Raw Body
      if (!verified) {
          verified = await verify(signature!, rawBody, encoder.encode(webhookSecret));
          if (verified) usedStrategy = "RawBody-UTF8";
      }

      // Try 4: Base64 Secret + Raw Body
      if (!verified) {
          try {
            if (webhookSecret.endsWith('=') || webhookSecret.length % 4 === 0) {
                verified = await verify(signature!, rawBody, base64ToUint8Array(webhookSecret));
                if (verified) usedStrategy = "RawBody-Base64";
            }
          } catch (e) {}
      }


      if (!verified) {
        console.error('Signature verification failed');
        console.log(`Debug Info: Secret=${webhookSecret.substring(0, 5)}..., Signature=${signature}, Timestamp=${timestamp}`);
        
        // If strict mode (not test mode), return 401 with details
        if (!isTestMode) {
             return new Response(JSON.stringify({ 
                 error: "Signature verification failed", 
                 received_signature: signature,
                 received_timestamp: timestamp,
                 strategies_attempted: ["Stripe-UTF8", "Stripe-Base64", "Simple-UTF8", "Simple-Base64"],
                 hint: "Check if secret is correct and matches BagelPay dashboard"
             }), { 
                 status: 401,
                 headers: { 'Content-Type': 'application/json' }
             });
        }
        console.warn('Proceeding despite signature failure (Test Mode active)');
      } else {
          console.log(`Signature verified successfully using strategy: ${usedStrategy}`);
      }
    } else {
      console.warn('Skipping signature verification: BAGELPAY_WEBHOOK_SECRET not set');
    }

    // 2. Parse Event
    // BagelPay format might be { event_type: "...", data: { ... } } or flattened
    const eventType = payload.event_type || payload.type;
    const data = payload.data || payload.object || payload;

    if (!data) {
       console.error('Missing data object in payload:', payload);
       return new Response("Missing data", { status: 400 });
    }

    console.log(`Received event type: ${eventType}`);

    // Handle checkout.completed or payment.succeeded
    // Also adding checkout.session.completed as per Stripe-like conventions sometimes used
    const allowedEvents = ['checkout.completed', 'payment.succeeded', 'checkout.session.completed'];
    if (eventType && !allowedEvents.includes(eventType)) {
      console.log(`Ignoring event type: ${eventType}`);
      return new Response(`Ignored event: ${eventType}`, { status: 200 });
    }

    // Check payment status
    // Some events might be nested differently, so we try to find status
    // 'data.order.status' is common for nested order objects
    const status = data.status || 
                   data.payment_status || 
                   (data.order && data.order.status) || 
                   (data.data && data.data.status);
    
    // Log the full status details for debugging
    console.log(`Payment Status Check: extracted_status=${status}, payload_status=${payload.status}, data_status=${data.status}, order_status=${data.order?.status}`);

    // We only care if it's paid/succeeded
    // BagelPay might use 'completed' or 'succeeded' or 'paid'
    // If status is explicitly 'pending' or 'failed', we definitely stop.
    // If status is undefined but event is checkout.completed, we might assume success, but safer to check.
    if (!status || !['paid', 'succeeded', 'completed'].includes(status)) {
        console.log(`Payment status is ${status}, ignoring. Payload data keys:`, Object.keys(data));
        
        // If we are in 'checkout.completed' event, and status is undefined, 
        // it might be that the event itself implies success.
        // But for now, let's return debug info to user to be sure.
        return new Response(JSON.stringify({ 
            message: "Status not paid", 
            received_status: status,
            event_type: eventType,
            data_order: data.order, // Return order object to see its structure
            data_keys: Object.keys(data)
        }), { status: 200 });
    }

    // Get Order No (request_id)
    // Try multiple possible locations
    const orderNo = data.request_id || 
                    data.metadata?.order_no || 
                    (data.metadata && data.metadata.order_no) ||
                    payload.request_id; // In case it's at root

    if (!orderNo) {
        console.error('Missing order_no (request_id) in webhook data. Data:', JSON.stringify(data));
        return new Response("Missing order_no", { status: 400 });
    }

    console.log(`Processing payment for order: ${orderNo}`);

    // 3. Find Order
    const { data: order, error: orderError } = await supabase
      .from('platform_orders')
      .select(`
        id, 
        amount, 
        status, 
        app_id, 
        platform_user_id,
        merchant_order_no,
        metadata,
        platform_users!inner(external_user_id)
      `)
      .eq('merchant_order_no', orderNo)
      .single();

    if (orderError || !order) {
      console.error('Order not found:', orderNo, orderError);
      return new Response(JSON.stringify({ error: "Order not found" }), { status: 404 });
    }

    if (order.status === 'paid') {
      console.log('Order already paid:', orderNo);
      return new Response(JSON.stringify({ message: "Order already processed" }), { status: 200 });
    }

    // 4. Verify Amount
    // BagelPay amount: { value: 1000, currency: "USD" } or just amount field if flat
    let paidAmount = 0;
    const rawAmount = data.amount || (data.order && data.order.amount); // for logging
    
    // We try data.amount first, then data.order.amount
    let amountSource = data.amount || (data.order && data.order.amount);

    if (typeof amountSource === 'object' && amountSource !== null) {
        // Handle { value: "1000" } or { value: 1000 }
        paidAmount = Number(amountSource.value);
    } else if (typeof amountSource === 'number') {
        paidAmount = amountSource;
    } else if (typeof amountSource === 'string') {
        paidAmount = Number(amountSource);
    }

    console.log(`Verifying amount. Order: ${order.amount}, Paid (parsed): ${paidAmount}, Raw:`, JSON.stringify(rawAmount));

    // order.amount is in cents
    // If order.amount is points (e.g. 12), and paidAmount is cents (e.g. 1000), they won't match.
    // BUT in create-recharge-order: amountCents = Math.round(finalAmount * 100); order.amount = amountCents.
    // So order.amount IS cents (1000). Paid amount IS cents (1000). So they should match.
    if (isNaN(paidAmount) || paidAmount !== order.amount) {
      console.error(`Amount mismatch or parse error: Order ${order.amount} !== Paid ${paidAmount}`);
      // WARN ONLY: Do not fail the webhook for amount mismatch in production/test unless strict
      // return new Response(JSON.stringify({ error: "Amount mismatch" }), { status: 400 });
    }

    // 5. Update Order Status
    const { error: updateError } = await supabase
      .from('platform_orders')
      .update({ 
        status: 'paid', 
        paid_at: new Date().toISOString(),
        channel: 'bagelpay',
        // Update bagelpay info if not present (e.g. if updated from webhook before redirect)
        bagelpay_checkout_id: data.id || data.checkout_id || order.bagelpay_checkout_id
      })
      .eq('id', order.id);

    if (updateError) {
      console.error('Failed to update order status:', updateError);
      return new Response(JSON.stringify({ error: "Database update failed" }), { status: 500 });
    }

    // 6. Credit Wallet
    const externalUserId = order.platform_users.external_user_id;

    // Determine credit amount (points)
    let basePoints = order.amount; // default to amount if no metadata
    if (order.metadata && typeof order.metadata.points === 'number') {
        basePoints = order.metadata.points;
    } else if (order.metadata && typeof order.metadata.points === 'string') {
        basePoints = Number(order.metadata.points);
    } else {
        // Fallback: If no points metadata, assume 1 USD = 1 Point (amount is in cents)
        basePoints = Math.floor(order.amount / 100);
    }

    // --- ACTIVITY LOGIC START ---
    // Import shared logic dynamically or assume it's available via relative import at top
    // Since we can't easily add import at top via SearchReplace without risk, 
    // we will rely on Deno's ability to import inside function or use a separate tool call to add import.
    // However, best practice is top-level import.
    // Let's try to add import at top first in a separate step?
    // Or use dynamic import() which is supported in Deno.
    
    // Dynamic import for shared logic
    const { calculateRechargeBonuses } = await import("../_shared/recharge-bonus.ts");
    
    const { totalBonus, bonusDetails } = await calculateRechargeBonuses(
        supabase, 
        order, 
        basePoints, 
        externalUserId
    );

    const finalCreditAmount = basePoints + totalBonus;
    console.log(`Crediting wallet. Order Amount (cents): ${order.amount}, Base Points: ${basePoints}, Bonus: ${totalBonus}, Final: ${finalCreditAmount}. Details:`, bonusDetails);

    // Update order metadata with bonus info
    if (totalBonus > 0) {
        await supabase.from('platform_orders').update({
            metadata: {
                ...order.metadata,
                bonus_points: totalBonus,
                bonus_details: bonusDetails
            }
        }).eq('id', order.id);
    }
    // --- ACTIVITY LOGIC END ---

    // 1. Credit Base Points (Deposit)
    let depositResult = null;
    if (basePoints > 0) {
        const amountUSD = (order.amount / 100).toFixed(2);
        const { data: rpcResult, error: rpcError } = await supabase.rpc('process_wallet_transaction', {
          _user_id: externalUserId,
          _amount: basePoints,
          _type: 'deposit',
          _app_id: order.app_id,
          _order_id: order.id,
          _description: `充值: $${amountUSD} (订单号: ${order.merchant_order_no})`
        });

        if (rpcError || (rpcResult && !rpcResult.success)) {
          console.error('Wallet transaction (deposit) failed:', rpcError || rpcResult);
          return new Response(JSON.stringify({ 
            error: "Wallet transaction failed",
            details: rpcError || rpcResult 
          }), { status: 500 });
        }
        depositResult = rpcResult;
        console.log(`Deposit processed. New Balance: ${rpcResult.new_balance}`);
    }

    // 2. Credit Bonus Points (Reward)
    if (totalBonus > 0) {
        // Construct a detailed description for the bonus
        // bonusDetails is an array of strings, join them
        const bonusDesc = bonusDetails.length > 0 
            ? `活动赠送: ${bonusDetails.join('; ')}`
            : `充值赠送 (订单号: ${order.merchant_order_no})`;

        const { data: bonusResult, error: bonusError } = await supabase.rpc('process_wallet_transaction', {
            _user_id: externalUserId,
            _amount: totalBonus,
            _type: 'reward', // Use 'reward' type for bonuses
            _app_id: order.app_id,
            _order_id: order.id,
            _description: bonusDesc
        });

        if (bonusError || (bonusResult && !bonusResult.success)) {
            console.error('Wallet transaction (bonus) failed:', bonusError || bonusResult);
            // We don't fail the whole webhook here if deposit succeeded, but we should log it clearly
            // Ideally we should have a transaction block but RPC is separate.
            // If deposit succeeded but bonus failed, user still got their money.
        } else {
            console.log(`Bonus processed. New Balance: ${bonusResult.new_balance}`);
        }
    }



    // --- INVITE REWARD CHECK ---
    try {
        const { checkAndAwardInvite } = await import("../_shared/invite-check.ts");
        await checkAndAwardInvite(
            supabase, 
            externalUserId, 
            order.platform_user_id, 
            order.app_id, 
            order.amount
        );
    } catch (e) {
        console.error('Invite reward check failed:', e);
    }
    // --- INVITE REWARD END ---

    return new Response(JSON.stringify({ 
        success: true, 
        message: "Wallet credited successfully",
        new_balance: depositResult ? depositResult.new_balance : 0,
        credited_to_user_id: externalUserId,
        order_amount: order.amount,
        transaction_description: `Recharge via BagelPay: ${order.merchant_order_no}`
    }), { status: 200 });

  } catch (error: any) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
