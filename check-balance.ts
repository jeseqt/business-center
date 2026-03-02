
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { config } from "https://deno.land/x/dotenv/mod.ts";

// Load environment variables
const env = config();
const supabaseUrl = env.SUPABASE_URL || Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUserBalance() {
  const targetEmail = "1281311628@qq.com";
  console.log(`Checking data for user: ${targetEmail}`);

  // 1. Get User ID from auth.users (if possible) or platform_users
  // platform_users is our main table for business logic
  const { data: user, error: userError } = await supabase
    .from('platform_users')
    .select('*')
    .eq('email', targetEmail)
    .single();

  if (userError || !user) {
    console.error("User not found in platform_users:", userError);
    return;
  }

  console.log("\n--- User Info ---");
  console.log(`ID: ${user.id}`);
  console.log(`External User ID (Auth ID): ${user.external_user_id}`);
  console.log(`Email: ${user.email}`);

  // 2. Check Wallet
  // Wallet usually keyed by user_id (which is external_user_id in our system based on memory)
  // Let's check both ID and external_user_id to be safe
  const { data: walletExternal, error: walletError1 } = await supabase
    .from('platform_wallets')
    .select('*')
    .eq('user_id', user.external_user_id)
    .single();

  const { data: walletInternal, error: walletError2 } = await supabase
    .from('platform_wallets')
    .select('*')
    .eq('user_id', user.id)
    .single();

  console.log("\n--- Wallet Info ---");
  if (walletExternal) {
    console.log(`[Found by External ID] Balance: ${walletExternal.balance} (cents?), ID: ${walletExternal.id}`);
  } else {
    console.log(`[Not Found by External ID]`);
  }

  if (walletInternal) {
    console.log(`[Found by Internal ID] Balance: ${walletInternal.balance} (cents?), ID: ${walletInternal.id}`);
  } else {
    console.log(`[Not Found by Internal ID]`);
  }

  // 3. Check Orders
  const { data: orders, error: ordersError } = await supabase
    .from('platform_orders')
    .select('*')
    .eq('platform_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log("\n--- Recent Orders ---");
  if (orders) {
    orders.forEach(o => {
      console.log(`Order ${o.merchant_order_no}: Status=${o.status}, Amount=${o.amount}, Created=${o.created_at}`);
    });
  } else {
    console.error("Error fetching orders:", ordersError);
  }

  // 4. Check Transactions
  // Transactions are usually linked to wallet_id
  if (walletExternal || walletInternal) {
    const walletId = walletExternal?.id || walletInternal?.id;
    const { data: txs, error: txError } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('wallet_id', walletId)
      .order('created_at', { ascending: false })
      .limit(5);

    console.log("\n--- Recent Transactions ---");
    if (txs) {
      txs.forEach(tx => {
        console.log(`Tx ${tx.id}: Amount=${tx.amount}, Type=${tx.type}, Desc=${tx.description}, Created=${tx.created_at}`);
      });
    } else {
      console.error("Error fetching transactions:", txError);
    }
  }
}

checkUserBalance();
