
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
  // Check platform_users count
  const { count: userCount, error: userError } = await supabase
    .from('platform_users')
    .select('*', { count: 'exact', head: true })

  if (userError) {
    console.error('Error counting users:', userError)
    return
  }

  // Check platform_user_bindings count
  const { count: bindingCount, error: bindingError } = await supabase
    .from('platform_user_bindings')
    .select('*', { count: 'exact', head: true })

  if (bindingError) {
    console.error('Error counting bindings:', bindingError)
    return
  }

  console.log(`Platform Users: ${userCount}`)
  console.log(`Platform User Bindings: ${bindingCount}`)

  if (userCount !== bindingCount) {
    console.warn('Warning: Mismatch between users and bindings count!')
  } else {
    console.log('Users and bindings count match perfectly.')
  }
}

main()
