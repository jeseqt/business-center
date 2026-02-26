
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: 'e:\\workspace\\cos\\business-center\\admin-portal\\.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const email = 'lambertcosine@163.com';
  console.log(`Checking user: ${email}`);

  // 1. Get User ID from platform_users (since we might not have access to auth.users directly via client without service role, 
  // but if we use service role key we can access auth.admin)
  
  // Try to list users using auth admin api if possible, or just search platform_users
  // platform_users stores external_user_id which matches auth.users.id
  
  const { data: pUser, error: pError } = await supabase
    .from('platform_users')
    .select('*')
    .eq('email', email)
    .single();

  if (pError) {
    console.log('Error finding platform user:', pError.message);
    // If not in platform_users, maybe they are in auth but not platform_users?
    // We can't easily query auth.users without service role key.
  } else {
    console.log('Found platform user:', pUser);
    const userId = pUser.external_user_id; // This should be the auth user id
    
    // 2. Check platform_admin_profiles
    const { data: adminProfile, error: adminError } = await supabase
        .from('platform_admin_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
        
    if (adminError) {
        console.error('Error checking admin profile:', adminError);
    } else {
        console.log('Admin Profile:', adminProfile || 'Not found');
        
        if (!adminProfile) {
            console.log('User is NOT an admin. Attempting to promote...');
            // 3. Promote to admin
            const { error: insertError } = await supabase
                .from('platform_admin_profiles')
                .insert({
                    id: userId,
                    role: 'super_admin', // Assuming role field exists and 'super_admin' is valid
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
                
            if (insertError) {
                console.error('Failed to promote user:', insertError);
            } else {
                console.log('Successfully promoted user to admin!');
            }
        } else {
            console.log('User is ALREADY an admin.');
        }
    }
  }
}

main();
