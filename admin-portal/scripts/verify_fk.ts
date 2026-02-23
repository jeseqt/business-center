
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
    console.log('Verifying FK constraints and data integrity...')

    // 1. Check if external_user_id is UUID type (implicitly checked by query)
    const { data: users, error } = await supabase
        .from('platform_users')
        .select('id, external_user_id, email')
        .limit(5)
    
    if (error) {
        console.error('Error selecting platform_users:', error)
        return
    }

    console.log(`Checked ${users.length} users. Sample data:`)
    users.forEach(u => console.log(`- ${u.email}: ${u.external_user_id}`))

    // 2. Verify specifically for yinjunzhe
    const targetEmail = 'yinjunzhe19941005@163.com'
    const { data: targetUser } = await supabase
        .from('platform_users')
        .select('*')
        .eq('email', targetEmail)
        .single()
        
    if (targetUser) {
        console.log(`\nVerification for ${targetEmail}:`)
        console.log(`- Platform ID: ${targetUser.id}`)
        console.log(`- External ID (Auth): ${targetUser.external_user_id}`)
        
        // Check bindings
        const { data: bindings } = await supabase
            .from('platform_user_bindings')
            .select('*')
            .eq('platform_user_id', targetUser.id)
            
        console.log(`- Bindings found: ${bindings?.length}`)
        bindings?.forEach(b => console.log(`  > ${b.identity_type}: ${b.external_user_id}`))
    } else {
        console.log(`\nUser ${targetEmail} not found in platform_users!`)
    }
}

main()
