
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Load environment variables from .env file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkRpc() {
  console.log('Checking if get_user_product_purchase_count RPC exists...');
  
  // Try to call it with dummy data
  const { data, error } = await supabase.rpc('get_user_product_purchase_count', {
    _app_id: '00000000-0000-0000-0000-000000000000',
    _product_id: '08497cc8-7d46-4b1c-aca6-f4d8e8c90a2e'
  });

  if (error) {
    console.error('RPC Check Failed:', error);
    if (error.message.includes('function') && error.message.includes('does not exist')) {
        console.log('RPC function does not exist. Please apply the migration.');
    }
  } else {
    console.log('RPC function exists and returned:', data);
  }
}

checkRpc();
