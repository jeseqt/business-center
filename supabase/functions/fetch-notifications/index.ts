import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-id',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Get App ID from header
    const appId = req.headers.get('x-app-id')
    if (!appId) {
      throw new Error('Missing x-app-id header')
    }

    // 2. Get active notifications
    // Filter by app_id, is_active, and time range
    const now = new Date().toISOString()
    const { data, error } = await supabaseClient
      .from('platform_app_notifications')
      .select('*')
      .eq('app_id', appId)
      .eq('is_active', true)
      .lte('start_time', now)
      .or(`end_time.is.null,end_time.gte.${now}`)
      .order('priority', { ascending: false }) // High priority first
      .order('created_at', { ascending: false })

    if (error) throw error

    return new Response(
      JSON.stringify({
        success: true,
        data: data,
        meta: { count: data?.length || 0 }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
