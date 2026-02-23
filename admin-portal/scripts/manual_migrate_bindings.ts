
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Load env from root
const rootEnvPath = path.resolve(__dirname, '../../.env')
if (fs.existsSync(rootEnvPath)) {
  const envConfig = fs.readFileSync(rootEnvPath, 'utf-8')
  envConfig.split('\n').forEach(line => {
    const [key, value] = line.split('=')
    if (key && value) {
      process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '')
    }
  })
}

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

async function main() {
  console.log('Manually migrating bindings...')
  
  // 1. Get all platform_users
  const { data: users, error: userError } = await supabase
    .from('platform_users')
    .select('id, app_id, external_user_id')
    
  if (userError) {
    console.error('Error fetching users:', userError)
    return
  }
  
  console.log(`Found ${users.length} users.`)
  
  // 2. Insert into platform_user_bindings
  const bindings = users.map(u => ({
    platform_user_id: u.id,
    app_id: u.app_id,
    external_user_id: u.external_user_id,
    identity_type: 'auth_user_id'
  }))
  
  const { error: insertError } = await supabase
    .from('platform_user_bindings')
    .upsert(bindings, { onConflict: 'app_id,external_user_id,identity_type' })
    
  if (insertError) {
    console.error('Error inserting bindings:', insertError)
  } else {
    console.log(`Successfully migrated/upserted ${bindings.length} bindings.`)
  }
  
  // 3. Verify count
  const { count: bindingCount } = await supabase
    .from('platform_user_bindings')
    .select('*', { count: 'exact', head: true })
    
  console.log(`Current bindings count: ${bindingCount}`)
}

main()
