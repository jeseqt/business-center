
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual .env parsing
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env'); 
  if (!fs.existsSync(envPath)) {
    console.error('.env file not found at', envPath);
    return {};
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  content.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^['"]|['"]$/g, '');
      env[key] = value;
    }
  });
  return env;
}

const env = loadEnv();
const supabaseUrl = env.SUPABASE_URL || 'https://cozklbnjwqqtwibwzszg.supabase.co';
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Admin client
const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function diagnoseUser() {
  const email = '1281311628@qq.com';
  console.log(`Diagnosing user: ${email}`);
  
  // 1. Check Auth User
  // Note: listUsers only returns up to 50 users, we should filter but listUsers doesn't support email filter directly in admin API easily unless we iterate
  // But wait, we can't search by email directly via admin.listUsers easily in older versions, but let's try.
  // Actually, we can just use `admin.listUsers` and filter in JS if the list is small.
  
  const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers();
  
  if (listError) {
    console.error('Error listing users:', listError);
    return;
  }

  const user = users.find(u => u.email === email);
  
  if (!user) {
    console.error('User not found in Auth!');
    return;
  }

  console.log('Auth User Found:', {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata
  });

  const userId = user.id;

  // 2. Check Platform User
  const { data: platformUser, error: puError } = await adminClient
    .from('platform_users')
    .select('*')
    .eq('email', email)
    .single();

  if (puError) {
    console.error('Platform User Error:', puError);
  } else {
    console.log('Platform User Found:', platformUser);
    
    // Check external_user_id match
    if (platformUser.external_user_id !== userId) {
      console.warn('MISMATCH: platform_users.external_user_id does not match auth.users.id');
      console.warn(`Expected: ${userId}, Actual: ${platformUser.external_user_id}`);
    }
  }

  // 3. Check Wallet
  if (platformUser) {
    const { data: wallet, error: walletError } = await adminClient
      .from('platform_wallets')
      .select('*')
      .eq('platform_user_id', platformUser.id)
      .single();

    if (walletError) {
      console.error('Wallet Error:', walletError);
    } else {
      console.log('Wallet Found:', wallet);
    }
  }

  // 4. Simulate RPC call for this user
  // To do this, we need to sign in as this user. But we don't have their password.
  // However, we can use `admin.generateLink` to get a token? No, that's for email links.
  // We can't easily impersonate a user without their password to call RPC *as* them via the client.
  // BUT, we can call the RPC via Postgres function directly using SQL if we wanted to test logic, 
  // but we want to test the full stack including RLS.
  
  // Wait, we can use `supabase.auth.admin.getUserById(uid)` to get the user object, but not a session.
  // A trick is to update the user's password temporarily, sign in, then revert? Too risky for a real user.
  
  // Instead, let's use `analyze_rpc_perf` function I created earlier!
  // It takes the current user, but I can modify it to take a specific user ID for testing.
  // Let's call `analyze_rpc_perf` but wait, it uses `auth.uid()`.
  
  // Let's create a special debug function that takes a user_id and runs the logic
  // to see if it throws errors or is slow.
  
  console.log('Running analysis for user ID:', userId);
  
  // We can't call `get_or_create_user_dashboard_data` directly with an argument because it takes none.
  // But we can run a SQL query via RPC that mimics it.
  
  const { data: analysis, error: analysisError } = await adminClient.rpc('analyze_rpc_perf');
  // This analyzes the *current* user (which is service role if we use admin client? No, service role has no auth.uid())
  // Service role bypasses RLS, so auth.uid() is null.
  
  // We need to impersonate. 
  // We can use `SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub" = '...'` in SQL
  // But we can't easily do that via client RPC without a custom function.
  
  // Let's just check the data consistency first.
}

diagnoseUser();
