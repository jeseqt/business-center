
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
      const value = match[2].trim().replace(/^['"]|['"]$/g, ''); // Remove quotes
      env[key] = value;
    }
  });
  return env;
}

const env = loadEnv();
const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkApps() {
  console.log('Checking platform_apps...');
  const { data: apps, error } = await supabase.from('platform_apps').select('*');
  
  if (error) {
    console.error('Error fetching apps:', error);
    return;
  }

  console.log('Platform Apps:', JSON.stringify(apps, null, 2));

  if (apps.length === 0) {
    console.log('No apps found. Creating default app...');
    const { data: newApp, error: createError } = await supabase.from('platform_apps').insert({
      name: 'Business Center',
      slug: 'business-center',
      status: 'active'
    }).select();

    if (createError) {
      console.error('Error creating app:', createError);
    } else {
      console.log('Created app:', newApp);
    }
  }
}

checkApps();
