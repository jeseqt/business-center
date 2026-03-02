
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Manually parse .env from parent directory
const envPath = path.resolve(__dirname, '../.env');
console.log(`Reading .env from: ${envPath}`);
const envContent = fs.readFileSync(envPath, 'utf-8');
console.log(`First 100 chars of .env: ${envContent.substring(0, 100)}`);
const env = {};
envContent.split('\n').forEach(line => {
  line = line.trim();
  if (!line || line.startsWith('#')) return;
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1].trim()] = value;
  }
});
console.log('Parsed env keys:', Object.keys(env));


const supabaseUrl = env.SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUserBalance() {
  const targetEmail = "1281311628@qq.com";
  console.log(`Checking data for user: ${targetEmail}`);

  // 1. Get User ID from platform_users
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
  console.log(`App ID: ${user.app_id}`);

  // 2. Check Wallet
  // Wallet links to platform_user_id (internal ID)
  const { data: wallet, error: walletError } = await supabase
    .from('platform_wallets')
    .select('*')
    .eq('platform_user_id', user.id)
    .single();
    
  console.log("\n--- Wallet Info ---");
  if (wallet) {
    console.log(`[Found] Balance: ${wallet.balance_permanent}, ID: ${wallet.id}, PlatformUserID: ${wallet.platform_user_id}, AppID: ${wallet.app_id}`);
  } else {
    console.log(`[Not Found] Error: ${walletError?.message}`);
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
      console.log(`Order ${o.merchant_order_no}: ID=${o.id}, Status=${o.status}, Amount=${o.amount}, Created=${o.created_at}, AppID=${o.app_id}`);
    });
  } else {
    console.error("Error fetching orders:", ordersError);
  }

  // 4. Check Wallet Transactions
  if (wallet) {
    const { data: txs, error: txError } = await supabase
      .from('platform_wallet_transactions')
      .select('*')
      .eq('wallet_id', wallet.id)
      .order('created_at', { ascending: false })
      .limit(5);
      
    console.log("\n--- Recent Wallet Transactions ---");
    if (txs) {
      txs.forEach(tx => {
        console.log(`TX ${tx.id}: Type=${tx.type}, Amount=${tx.amount}, BalanceAfter=${tx.balance_after}, Desc=${tx.description}`);
      });
    } else {
      console.error("Error fetching transactions:", txError);
    }
  }
}

checkUserBalance();
