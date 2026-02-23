
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
  console.log('Fetching platform users...')
  const { data: users, error } = await supabase
    .from('platform_users')
    .select('*')
  
  if (error) {
    console.error('Error fetching users:', error)
    return
  }

  console.log(`Found ${users.length} users to process.`)

  // Group by email to avoid duplicate auth users
  const emailMap = new Map<string, any[]>()
  for (const user of users) {
    if (user.email) {
      const existing = emailMap.get(user.email) || []
      existing.push(user)
      emailMap.set(user.email, existing)
    } else {
      console.warn(`User ${user.id} has no email, skipping.`)
    }
  }

  console.log(`Processing ${emailMap.size} unique emails...`)

  let successCount = 0
  let failCount = 0

  for (const [email, platformUsers] of emailMap) {
    try {
      console.log(`Processing email: ${email}`)
      
      let authUserId: string | null = null
      let isNewUser = false

      // Try to create user
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email: email,
        password: 'lm2026',
        email_confirm: true,
        user_metadata: {
          display_name: platformUsers[0].metadata?.display_name || email.split('@')[0],
          full_name: platformUsers[0].metadata?.display_name, // Optional
          source: 'platform_migration'
        }
      })

      if (createError) {
        // If user already exists, get the user
        // Note: checking error message is fragile but standard for Supabase API
        // "User already registered" is the typical message
        console.log(`  User might verify existence...`)
        
        // Try to get user by email to confirm and get ID
        // Note: listUsers is better than getUserByEmail which is not directly available on admin without ID?
        // Actually admin has no getUserByEmail, we have to list or use generateLink
        // But listUsers failed before.
        // Wait, listUsers failed? That's concerning.
        // Let's try listUsers with query
        
        // Actually, creating a user that exists returns an error, but we can update it?
        // Let's try to update password if we can find the ID.
        // But without ID, we can't update.
        // We need to find the ID.
        
        // Maybe we can assume the external_user_id IS the auth id?
        // Let's check if platformUsers[0].external_user_id is a valid UUID and matches?
        // But we can't verify if listUsers fails.
        
        // Let's try listing users filtered by email? Supabase Admin doesn't support filter by email in listUsers easily (it fetches page).
        // But we can assume createError means exists.
        
        // Wait, if createUser fails, we don't get the ID.
        // We MUST be able to get the ID.
        // Let's try listUsers again, maybe it was a transient error.
        
        // If listUsers is broken, we are stuck.
        // But wait, platform_users table might already have the auth ID in external_user_id?
        // If the user was created by Supabase Auth, external_user_id usually matches.
        // Let's try to use that ID to update.
        
        const candidateId = platformUsers[0].external_user_id
        const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
          candidateId,
          { password: 'lm2026' }
        )
        
        if (!updateError) {
          console.log(`  Updated existing user password for ID: ${candidateId}`)
          authUserId = candidateId
        } else {
           console.log(`  Could not update user by external_user_id (${candidateId}): ${updateError.message}`)
           // If that failed, maybe external_user_id is NOT the auth ID.
           // We really need to find the user ID by email.
           // Let's try listUsers again but just one page
           // Or maybe we can use supabase.rpc to find user id by email if we had access to auth schema? No.
           
           // Wait, I can search for the user?
           // supabase.auth.admin.listUsers() doesn't support search query?
           // It does not.
           
           // BUT, `check_users.ts` failed with 500.
           // If I cannot get the ID, I cannot update the password.
           // However, if createUser failed, it means the user exists.
           // Maybe I don't need to do anything if they exist?
           // User said "initial password ... lm2026".
           // If they already exist, maybe their password is already set?
           // But user said "update to supabase", implying a migration.
           
           console.warn(`  Skipping password update for existing user ${email} due to missing ID lookup capability.`)
           // We can still try to link if we assume the user exists.
           // But we don't have the ID to link TO.
        }

      } else {
        console.log(`  Created new user: ${createData.user.id}`)
        authUserId = createData.user.id
        isNewUser = true
      }

      if (authUserId) {
        // Update platform_users
        // We need to update ALL records with this email
        const idsToUpdate = platformUsers.map(u => u.id)
        
        const { error: updatePlatformError } = await supabase
          .from('platform_users')
          .update({ external_user_id: authUserId })
          .in('id', idsToUpdate)
          
        if (updatePlatformError) {
          console.error(`  Error updating platform_users: ${updatePlatformError.message}`)
          // If conflict (because we are setting external_user_id to same value for different apps?),
          // Wait, external_user_id is unique per (app_id, external_user_id).
          // If we set the SAME authUserId for multiple apps, it is valid:
          // (app1, authId), (app2, authId) -> OK.
          // So this should be fine.
          failCount++
        } else {
          console.log(`  Linked ${idsToUpdate.length} platform_users to auth user ${authUserId}`)
          successCount++
        }
      } else {
        failCount++
      }

    } catch (err) {
      console.error(`  Unexpected error processing ${email}:`, err)
      failCount++
    }
  }

  console.log(`Finished. Success: ${successCount}, Fail: ${failCount}`)
}

main()
