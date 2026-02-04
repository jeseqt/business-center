import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, verifyApp, createSupabaseClient } from "../_shared/auth-middleware.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    
    // 1. Verify App (Middleware)
    // 验证请求是否来自合法的 APP
    const appContext = await verifyApp(req, supabase);
    const { app_id } = appContext;

    // 2. Parse Body
    const body = await req.json();
    const { action, email, password, invite_code, account } = body;

    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    let result;

    // 3. Handle Actions
    if (action === 'register') {
      // 3.1 Register Logic
      
      // Verify Invite Code (if provided)
      if (invite_code) {
         const { data: validCodes, error: codeError } = await supabase
            .from('platform_invite_codes')
            .select('id')
            .eq('code', invite_code)
            .eq('app_id', app_id)
            .eq('status', 'active');
            
         if (codeError || !validCodes || validCodes.length === 0) {
             throw new Error('Invalid or inactive invite code');
         }
      }

      // 创建 Supabase Auth 用户
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // 自动确认邮箱，简化流程
        user_metadata: {
            account: account || email.split('@')[0], // 默认使用邮箱前缀作为账号
            app_id: app_id
        }
      });

      if (authError) throw authError;

      const userId = authData.user.id;

      // 在 platform_users 中建立映射
      const { error: platformError } = await supabase
        .from('platform_users')
        .insert({
          app_id: app_id,
          external_user_id: userId, // 这里我们直接用 Supabase User ID 作为外部 ID，方便关联
          email: email,
          account: account || email.split('@')[0],
          metadata: { email, source: 'client_api' }
        });
        
      if (platformError) {
         // 回滚：如果业务表插入失败，最好删除 Auth 用户 (这里简化处理，仅报错)
         console.error('Platform user creation failed', platformError);
         throw new Error('User registration failed in platform');
      }

      // Initialize Wallet (Create default wallet for new user)
      const { error: walletError } = await supabase
        .from('platform_wallets')
        .insert({
            user_id: userId,
            balance: 0,
            currency: 'CNY'
        });
        
      if (walletError) {
          console.error('Failed to create wallet:', walletError);
          // Non-blocking error, user is created
      }

      // Redeem Invite Code (if provided)
      if (invite_code) {
          // 调用 RPC 使用邀请码
          // 即使这里失败，用户也已注册成功，所以我们只记录错误不抛出，或者视业务需求而定
          const { error: redeemError } = await supabase.rpc('redeem_global_invite_code', {
             _user_id: userId,
             _code: invite_code,
             _app_id: app_id
          });
          
          if (redeemError) {
             console.error('Invite code redeem failed', redeemError);
          }
      }
      
      // 自动登录
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (signInError) throw signInError;
      result = signInData;

    } else if (action === 'login') {
      // 3.2 Login Logic
      // 先登录 Supabase Auth
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) throw signInError;
      
      const userId = signInData.user.id;

      // 检查该用户是否属于当前 APP
      // 查询 platform_users
      const { data: platformUser, error: platformError } = await supabase
        .from('platform_users')
        .select('id')
        .eq('app_id', app_id)
        .eq('external_user_id', userId)
        .single();

      if (!platformUser) {
        // 关键逻辑：如果用户存在于 Auth 但不在当前 App 中
        // 策略 A: 自动注册进当前 App (本次采用)
        // 策略 B: 拒绝登录
        
        await supabase
          .from('platform_users')
          .insert({
            app_id: app_id,
            external_user_id: userId,
            metadata: { email }
          });
      }

      result = signInData;

    } else {
      throw new Error('Invalid action. Use "register" or "login"');
    }

    // 4. Return Result
    return new Response(
      JSON.stringify({ 
        success: true,
        data: result,
        app_context: {
          app_id // 返回确认的 App ID
        }
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
