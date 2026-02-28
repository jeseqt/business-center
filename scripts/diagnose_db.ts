
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual .env parsing
function loadEnv() {
  const envPath = path.resolve(__dirname, '../admin-portal/.env');
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
      const value = match[2].trim().replace(/^['"]|['"]$/g, ''); // Remove quotes
      env[key] = value;
    }
  });
  return env;
}

const env = loadEnv();
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY; 

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  console.log('Running database diagnosis...');
  
  // 1. Call debug_database_state
  const { data, error } = await supabase.rpc('debug_database_state');
  
  if (error) {
    console.error('Error calling debug_database_state:', error);
    return;
  }

  console.log('Diagnosis Result:');
  console.log(JSON.stringify(data, null, 2));
}

diagnose();
