
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-key',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      // Note: These env vars must be set in your Platform Supabase project
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Validate App Key
    const appKey = req.headers.get('x-app-key')
    if (!appKey) {
      throw new Error('Missing x-app-key header')
    }

    const { data: appData, error: appError } = await supabaseClient
      .from('platform_apps')
      .select('id, status')
      .eq('app_key', appKey)
      .single()

    if (appError || !appData) {
      return new Response(
        JSON.stringify({ error: 'Invalid App Key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (appData.status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'App is not active' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Parse Body
    const { external_user_id, model, tokens, metadata } = await req.json()
    
    if (!external_user_id || !model || !tokens) {
      throw new Error('Missing required fields')
    }

    // 3. Ensure Platform User Exists
    // Using upsert to handle race conditions simply
    // Note: In production, you might want to separate user syncing from usage reporting for performance
    const { data: userData, error: userError } = await supabaseClient
      .from('platform_users')
      .select('id')
      .eq('app_id', appData.id)
      .eq('external_user_id', external_user_id)
      .maybeSingle()

    let platformUserId = userData?.id

    if (!platformUserId) {
        const { data: newUser, error: createError } = await supabaseClient
            .from('platform_users')
            .insert({
                app_id: appData.id,
                external_user_id: external_user_id,
                metadata: { source: 'auto-created-by-usage' }
            })
            .select('id')
            .single()
        
        if (createError) throw createError
        platformUserId = newUser.id
    }

    // 4. Record Usage
    const { error: usageError } = await supabaseClient
      .from('platform_token_usage')
      .insert({
        app_id: appData.id,
        platform_user_id: platformUserId,
        model_name: model,
        prompt_tokens: tokens.prompt || 0,
        completion_tokens: tokens.completion || 0,
        total_tokens: (tokens.prompt || 0) + (tokens.completion || 0),
        // Simple cost calculation logic (should be configurable per model)
        cost_usd: 0.00001 * ((tokens.prompt || 0) + (tokens.completion || 0)), 
        request_metadata: metadata
      })

    if (usageError) throw usageError

    return new Response(
      JSON.stringify({ success: true, message: 'Usage recorded' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
