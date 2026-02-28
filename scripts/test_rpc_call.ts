
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual .env parsing
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env'); // Use root .env for service key
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
// We also need anon key for client-side ops if needed, but service key can do admin ops.
// To call RPC as user, we need to sign in as user, which returns a session.

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Admin client
const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function testRpc() {
  const email = `test_rpc_${Date.now()}@gmail.com`;
  const password = 'password123';

  console.log(`Creating test user via Admin API: ${email}`);
  
  // Create user with app_slug metadata
  const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      app_slug: 'business-center'
    }
  });

  if (createError) {
    console.error('Admin CreateUser error:', createError);
    return;
  }

  const userId = userData.user?.id;
  console.log(`User created: ${userId}`);

  // Now sign in as this user to get a session
  // We can use a separate client or just use signInWithPassword on a new client instance
  // Note: We need a client initialized with ANON key to simulate real user behavior properly?
  // Actually, we can use the admin client to sign in too, but it's better to use anon key for the client.
  
  // Let's get anon key from .env as well if possible, or just hardcode it since we saw it earlier.
  const anonKey = env.SUPABASE_ANON_KEY;
  const userClient = createClient(supabaseUrl, anonKey);

  console.log('Signing in...');
  const { data: sessionData, error: loginError } = await userClient.auth.signInWithPassword({
    email,
    password
  });

  if (loginError) {
    console.error('Login error:', loginError);
    return;
  }

  console.log('Logged in. Calling RPC: get_or_create_user_dashboard_data');
  const start = Date.now();
  
  const { data, error } = await userClient.rpc('get_or_create_user_dashboard_data');
  
  const duration = Date.now() - start;
  console.log(`RPC Duration: ${duration}ms`);

  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log('RPC Success:', JSON.stringify(data, null, 2));
  }
  
  // Clean up
  console.log('Cleaning up user...');
  await adminClient.auth.admin.deleteUser(userId!);
}

testRpc();
