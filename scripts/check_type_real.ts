
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envPath = 'E:\\workspace\\cos\\business-center\\.env'; 
  if (!fs.existsSync(envPath)) {
    console.error('File not found:', envPath);
    return {};
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  content.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  });
  return env;
}

const env = loadEnv();
// Fallback values from diagnose_db.ts
const supabaseUrl = env.SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Env keys:', Object.keys(env));

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing credentials');
  process.exit(1);
}

// If the key is invalid, createClient might not fail immediately, but RPC will.
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
  const { data, error } = await supabase.rpc('debug_schema_info', {
    p_table: 'platform_users',
    p_column: 'external_user_id'
  });
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Column Type:', data);
  }
}

check();
