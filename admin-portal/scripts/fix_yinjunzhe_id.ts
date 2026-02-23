
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
  console.log('Finding problematic user ID...')
  const targetId = 'ce71cc9e-c747-4f14-8383-c5fd7411d58e'
  const targetEmail = 'yinjunzhe19941005@163.com'

  // 1. Check platform_users for this ID
  const { data: pUser, error: pError } = await supabase
    .from('platform_users')
    .select('*')
    .eq('external_user_id', targetId)
    .single()
    
  if (pUser) {
    console.log('Found platform_user with old ID:', pUser.id, pUser.email)
  } else {
    console.log('Platform user with old ID not found directly (maybe already fixed?).')
  }

  // 2. Find Auth User ID by Email with pagination
  console.log('Fetching all auth users...')
  let allUsers: any[] = []
  let page = 1
  const perPage = 100
  let hasNext = true

  while (hasNext) {
      const { data: { users }, error: authError } = await supabase.auth.admin.listUsers({
          page: page,
          perPage: perPage
      })
      
      if (authError) {
        console.error('Error listing auth users:', authError)
        return
      }

      if (users.length > 0) {
          allUsers = allUsers.concat(users)
          page++
      } else {
          hasNext = false
      }
      
      if (users.length < perPage) hasNext = false // Optimization
  }
  
  console.log(`Fetched ${allUsers.length} total auth users.`)

  const authUser = allUsers.find(u => u.email === targetEmail)
  
  if (authUser) {
    console.log(`Found Auth User for ${targetEmail}: ${authUser.id}`)
    await fixUser(pUser, authUser.id, targetId)
  } else {
    console.log(`Auth user not found for ${targetEmail}. Creating one...`)
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email: targetEmail,
        password: 'lm2026',
        email_confirm: true,
        user_metadata: {
            display_name: 'yinjunzhe19941005',
            source: 'manual_fix'
        }
    })

    if (createError) {
        console.error('Error creating auth user:', createError)
    } else {
        console.log(`Created new auth user: ${createData.user.id}`)
        await fixUser(pUser, createData.user.id, targetId)
    }
  }
}

async function fixUser(pUser: any, authId: string, legacyId: string) {
    if (!pUser) return

    console.log('Fixing platform_user...')
    
    // A. Backup old ID to bindings
    const { error: bindError } = await supabase
        .from('platform_user_bindings')
        .upsert({
            platform_user_id: pUser.id,
            app_id: pUser.app_id,
            external_user_id: legacyId,
            identity_type: 'legacy_business_id'
        }, { onConflict: 'app_id, external_user_id, identity_type' })
        
    if (bindError) console.error('Error backing up legacy ID:', bindError)
    else console.log('Backed up legacy ID to bindings.')

    // B. Add Auth ID to bindings
    const { error: bindAuthError } = await supabase
        .from('platform_user_bindings')
        .upsert({
            platform_user_id: pUser.id,
            app_id: pUser.app_id,
            external_user_id: authId,
            identity_type: 'auth_user_id'
        }, { onConflict: 'app_id, external_user_id, identity_type' })

    if (bindAuthError) console.error('Error adding auth binding:', bindAuthError)

    // C. Update platform_users.external_user_id to Auth ID
    const { error: updateError } = await supabase
        .from('platform_users')
        .update({ external_user_id: authId })
        .eq('id', pUser.id)
        
    if (updateError) {
        console.error('Error updating platform_users:', updateError)
    } else {
        console.log(`Successfully updated platform_user ${pUser.id} external_user_id to ${authId}`)
    }
}

main()
