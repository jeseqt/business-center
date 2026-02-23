
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
  const { data: users, error } = await supabase
    .from('platform_users')
    .select('*')
  
  if (error) {
    console.error('Error fetching users:', error)
    return
  }
  
  console.log(`Found ${users.length} users in platform_users table.`)
  if (users.length > 0) {
    console.log('Sample user:', users[0])
    // Check if there are duplicate accounts
    const accounts = users.map(u => u.account).filter(Boolean)
    const uniqueAccounts = new Set(accounts)
    console.log(`Unique accounts: ${uniqueAccounts.size} / ${accounts.length}`)

    // Check if external_user_id exists in auth.users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    if (authError) {
      console.error('Error fetching auth users:', authError)
    } else {
      console.log(`Found ${authUsers.users.length} auth users.`)
      const authUserIds = new Set(authUsers.users.map(u => u.id))
      const linkedUsers = users.filter(u => authUserIds.has(u.external_user_id))
      console.log(`Users with matching external_user_id in auth: ${linkedUsers.length} / ${users.length}`)
      
      const emailMatches = users.filter(u => authUsers.users.some(au => au.email === u.email))
      console.log(`Users with matching email in auth: ${emailMatches.length} / ${users.length}`)
    }
  }
}

main()
