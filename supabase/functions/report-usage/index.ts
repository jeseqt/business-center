import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, verifyApp, createSupabaseClient } from "../_shared/auth-middleware.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();

    // 1. Verify App
    const appContext = await verifyApp(req, supabase, { requireSignature: true });
    const { app_id } = appContext;

    // 2. Authenticate User (Bearer Token)
    // 用量上报通常需要关联到具体用户，防止滥用
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    // 3. Find Platform User ID
    const { data: platformUser, error: platformUserError } = await supabase
      .from('platform_users')
      .select('id')
      .eq('app_id', app_id)
      .eq('external_user_id', user.id)
      .single();

    if (platformUserError || !platformUser) {
      throw new Error('User not registered in this app context');
    }

    // 4. Parse Body
    const { 
      model_name, 
      prompt_tokens = 0, 
      completion_tokens = 0, 
      request_metadata = {} 
    } = await req.json();

    if (!model_name) {
      throw new Error('Missing model_name');
    }

    // 简单估算成本 (示例费率，实际应从配置表读取)
    // 假设: Input $5/1M, Output $15/1M
    const cost = (prompt_tokens * 5 + completion_tokens * 15) / 1000000;

    // 5. Record Usage
    const usageData = {
      app_id: app_id,
      platform_user_id: platformUser.id,
      model_name,
      prompt_tokens,
      completion_tokens,
      total_tokens: prompt_tokens + completion_tokens,
      cost_usd: cost,
      request_metadata
    };

    const { data: usage, error: usageError } = await supabase
      .from('platform_token_usage')
      .insert(usageData)
      .select()
      .single();

    if (usageError) {
      console.error('Usage reporting failed', usageError);
      throw new Error('Usage reporting failed');
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: usage
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
