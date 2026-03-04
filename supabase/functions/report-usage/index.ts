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

    // 5. Calculate Cost
    // Exchange Rate: 1 USD = 7.25 CNY (Conservative estimate)
    const EXCHANGE_RATE_CNY_TO_USD = 1 / 7.25;

    interface Pricing {
      input: number | ((tokens: number) => number);  // Price per 1M tokens OR function returning total cost
      output: number; // Price per 1M tokens
      currency: 'USD' | 'CNY';
    }

    // Helper for tiered pricing (returns total cost based on token count bucket)
    const tieredPrice = (tokens: number, tiers: { limit: number, rate: number }[]) => {
      for (const tier of tiers) {
        if (tokens <= tier.limit) return (tokens / 1_000_000) * tier.rate;
      }
      return (tokens / 1_000_000) * tiers[tiers.length - 1].rate;
    };

    // Pricing Table (Last updated: 2025-02, based on official docs)
    // Qwen prices: https://www.alibabacloud.com/help/en/model-studio/model-pricing
    // OpenAI prices: https://openai.com/api/pricing/
    const PRICING_TABLE: Record<string, Pricing> = {
      // Qwen Models (CNY)
      'qwen-turbo':           { input: 0.3,  output: 0.6,  currency: 'CNY' },
      'qwen-plus':            { 
        input: (t) => tieredPrice(t, [
          { limit: 32_768, rate: 0.8 },
          { limit: 131_072, rate: 1.2 },
          { limit: Infinity, rate: 1.6 }
        ]), 
        output: 2.0,  
        currency: 'CNY' 
      },
      'qwen-max':             { 
        input: (t) => tieredPrice(t, [
          { limit: 32_768, rate: 2.4 }, // 0.0024
          { limit: 131_072, rate: 4.0 }, // 0.004
          { limit: Infinity, rate: 7.0 }  // 0.007
        ]), 
        output: 9.6,  
        currency: 'CNY' 
      }, 
      // OpenAI Models (USD)
      'gpt-4o':               { input: 2.50, output: 10.00, currency: 'USD' }, // gpt-4o-2024-08-06 pricing
      'text-embedding-v3':    { input: 0.02, output: 0.00,  currency: 'USD' },
      // Default / Fallback (USD) - rough estimate for unknown high-end models
      'default':              { input: 5.00, output: 15.00, currency: 'USD' }
    };

    let pricing = PRICING_TABLE['default'];
    
    // Find matching pricing
    // 1. Exact match
    if (PRICING_TABLE[model_name]) {
      pricing = PRICING_TABLE[model_name];
    } else {
      // 2. Prefix match (e.g., 'qwen-plus-2025-01-25' -> 'qwen-plus')
      const keys = Object.keys(PRICING_TABLE).filter(k => k !== 'default');
      // Sort by length desc to match longest prefix first (e.g. 'qwen-max-long' before 'qwen-max')
      keys.sort((a, b) => b.length - a.length);
      
      for (const key of keys) {
        if (model_name.startsWith(key)) {
          pricing = PRICING_TABLE[key];
          break;
        }
      }
    }

    let inputCost = 0;
    if (typeof pricing.input === 'function') {
      inputCost = pricing.input(prompt_tokens);
    } else {
      inputCost = (prompt_tokens / 1_000_000) * pricing.input;
    }

    let cost = inputCost + (completion_tokens / 1_000_000) * pricing.output;

    // Convert to USD if necessary
    if (pricing.currency === 'CNY') {
      cost = cost * EXCHANGE_RATE_CNY_TO_USD;
    }

    // 6. Record Usage
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
