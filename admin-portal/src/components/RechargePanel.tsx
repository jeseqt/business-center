import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Flame, Crown, Coins, Sparkles, Zap, Gift, Copy, Share2, CheckCircle2, ArrowRight, HelpCircle, AlertCircle } from 'lucide-react';
import { LambertCoin } from './LambertCoin';
import { Button } from './Button';
import { Modal } from './Modal';

interface Product {
  id: string;
  name: string;
  amount: number;
  points: number;
  description: string;
  tag?: string;
  button_text?: string;
}

interface RechargePanelProps {
  appId: string;
  className?: string;
}

// Activity Constants
const FRENZY_MULTIPLIER = 1.5;
const FIRST_RECHARGE_PERCENT = 0.10;
const CUMULATIVE_GOAL = 200;
const CUMULATIVE_REWARD = 30;

// UI Configuration Map
const PRODUCT_CONFIG: Record<number, {
  title: string;
  buttonText: string;
  highlight?: boolean;
  isPremium?: boolean;
  icon?: any;
}> = {
  1: { title: '新手体验', buttonText: '立即体验', icon: Sparkles },
  5: { title: '轻量入门', buttonText: '特惠充值', highlight: true, icon: Coins },
  10: { title: '人气爆款', buttonText: '立即抢购', highlight: true, icon: Flame },
  20: { title: '进阶畅玩', buttonText: '推荐充值', icon: Zap },
  50: { title: '尊享优选', buttonText: '尊享充值', isPremium: true, icon: Gift },
  100: { title: '至尊专属', buttonText: '立即开通', highlight: true, isPremium: true, icon: Crown },
};

export function RechargePanel({ appId, className }: RechargePanelProps) {
  const [amount, setAmount] = useState<number>(10);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Activity States
  const [isFirstRecharge, setIsFirstRecharge] = useState(false);
  const [hasPurchasedExperience, setHasPurchasedExperience] = useState(false);
  const [recentRechargeTotal, setRecentRechargeTotal] = useState(0);
  const [inviteCode, setInviteCode] = useState<string>('');
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [inviteCodeError, setInviteCodeError] = useState<string>('');

  const fetchInviteCode = async () => {
      if (!appId) return;
      // setInviteCode(''); // Don't clear immediately to avoid flickering if refreshing
      setInviteCodeError('');
      try {
          const { data, error } = await supabase.functions.invoke('get-invite-code');
          if (error) {
              console.error('Failed to fetch invite code:', error);
              setInviteCode('获取失败');
              // Try to extract error message
              let errMsg = error.message || 'Unknown error';
              try {
                  if (error instanceof Error && 'context' in error) {
                      const context = (error as any).context;
                      if (context && typeof context.json === 'function') {
                          const json = await context.json();
                          if (json.error) errMsg = json.error;
                      }
                  }
              } catch (e) { /* ignore */ }
              setInviteCodeError(errMsg);
          } else if (data) {
              setInviteCode(data.code || '无邀请码');
              if (data.redeemed_code) {
                  setInputCode(data.redeemed_code);
                  setInviteStatus('success');
              }
          } else {
              setInviteCode('无邀请码');
          }
      } catch (err: any) {
          console.error('Invite code fetch error:', err);
          setInviteCode('获取失败');
          setInviteCodeError(err.message || String(err));
      }
  };
  const [showInviteInput, setShowInviteInput] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [inviteError, setInviteError] = useState('');

  // Countdown Timer
  const [timeLeft, setTimeLeft] = useState<{hours: number, minutes: number, seconds: number}>({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    // Timer Logic
    const timer = setInterval(() => {
      const now = new Date();
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const diff = endOfDay.getTime() - now.getTime();
      if (diff > 0) {
        setTimeLeft({
          hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((diff / 1000 / 60) % 60),
          seconds: Math.floor((diff / 1000) % 60)
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!appId) return;

    // Fetch Products
    supabase
      .from('recharge_products')
      .select('*')
      .eq('is_active', true)
      .order('amount', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setProducts(data);
          const defaultProduct = data.find(p => p.amount === 30) || data[0];
          if (defaultProduct) {
            setSelectedProduct(defaultProduct);
            setAmount(defaultProduct.amount);
          }
        }
      });

    // Fetch User Status (First Recharge & Recent Total)
    const fetchUserStatus = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Check First Recharge (Any paid order?)
        // Note: We need to filter by platform_users linked to this user if possible, 
        // but since RLS limits to own orders, simple select is fine.
        // We assume platform_orders has RLS "Users can view own orders"
        const { count, error: countError } = await supabase
            .from('platform_orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'paid');
        
        if (!countError) {
            setIsFirstRecharge(count === 0);
        }

        // Check if user has purchased the 'New User Experience' (amount = 1)
        // Try RPC first (more robust if RLS is strict), fall back to direct query
        let hasPurchased = false;
        
        // 1. Try RPC if we can find the product ID
        // We need the product ID for the $1 item. 
        // Since products state might not be set yet inside this async function if run in parallel,
        // we should try to find it from the products list we just fetched if we merged logic, 
        // or fetch it separately.
        // To be safe and simple, we'll assume we can use the ID if we have it, or rely on amount query.
        
        // Let's use the direct query first but with a note that RLS is required.
        // IF RLS is missing, this returns 0.
        const { count: experienceCount, error: experienceError } = await supabase
            .from('platform_orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'paid')
            .eq('amount', 100); // 100 cents = $1
        
        if (!experienceError && experienceCount !== null && experienceCount > 0) {
            hasPurchased = true;
        }

        // 2. Try RPC as backup/alternative if direct query failed (likely due to RLS)
        if (!hasPurchased) {
             // We need to find the $1 product ID.
             const { data: expProducts } = await supabase
                .from('recharge_products')
                .select('id')
                .eq('amount', 1)
                .single();
             
             if (expProducts) {
                 const { data: rpcCount } = await supabase.rpc('get_user_product_purchase_count', {
                     _app_id: appId,
                     _product_id: expProducts.id
                 });
                 if (rpcCount && rpcCount > 0) {
                     hasPurchased = true;
                 }
             }
        }

        if (hasPurchased) {
            setHasPurchasedExperience(true);
        }

        // Check Recent Recharge Total (Last 7 days)
        // Try to use RPC first (bypasses RLS issues), fallback to direct query if RPC fails
        try {
            const { data: stats, error: rpcError } = await supabase.rpc('get_user_recharge_stats', {
                _app_id: appId
            });

            if (!rpcError && stats) {
                // Use RPC result directly
                // stats.recent_amount is in cents
                const recentAmount = Number(stats.recent_amount || 0);
                setRecentRechargeTotal(recentAmount / 100);
            } else {
                throw rpcError || new Error('RPC returned null');
            }
        } catch (err) {
            console.warn('RPC fetch failed, falling back to direct query:', err);
            
            // Fallback: Direct Query (subject to RLS)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            const { data: recentOrders, error: recentError } = await supabase
                .from('platform_orders')
                .select('amount')
                .eq('status', 'paid')
                .gte('created_at', sevenDaysAgo.toISOString());

            if (recentOrders) {
                const total = recentOrders.reduce((sum, order) => sum + order.amount, 0);
                setRecentRechargeTotal(total / 100);
            }
        }
    };

    fetchUserStatus();
    fetchInviteCode();

  }, [appId]);

  // Auto-switch away from Experience pack if already purchased
  useEffect(() => {
      if (hasPurchasedExperience && selectedProduct?.amount === 1 && products.length > 0) {
          // Find next available product (not amount 1)
          // Prefer "Popular" or "Best Value" ones if possible, but simplest is just next one
          const nextProduct = products.find(p => p.amount !== 1);
          if (nextProduct) {
              setSelectedProduct(nextProduct);
              setAmount(nextProduct.amount);
          }
      }
  }, [hasPurchasedExperience, selectedProduct, products]);

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product);
    setAmount(product.amount);
  };

  const handleRecharge = async () => {
    if (!appId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error('请先登录');
      
      // Force refresh session to ensure token is valid and not about to expire
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
          console.warn('Session refresh warning:', refreshError);
          // Don't throw immediately, try using existing session if valid
      }
      
      const currentSession = refreshData.session || session;
      const token = currentSession.access_token;
      
      // Use Anon Key for Authorization header to pass Gateway verification,
      // and pass the actual user token in a custom header to bypass Gateway's strict user token check.
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const returnUrl = `${window.location.origin}/dashboard/wallet?status=success`;
      
      // Use fetch instead of supabase.functions.invoke to guarantee header control
      // This prevents the Supabase client from automatically injecting the user's token into Authorization
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-recharge-order`;
      
      const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${anonKey}`,
              'x-client-token': token
          },
          body: JSON.stringify({
            app_id: appId, 
            return_url: returnUrl,
            amount: amount,
            product_id: selectedProduct?.id
          })
      });

      let result;
      let errorText;
      
      try {
          const text = await response.text();
          try {
              result = JSON.parse(text);
          } catch (e) {
              errorText = text;
          }
      } catch (e) {
          errorText = 'Failed to read response';
      }

      if (!response.ok) {
          console.error('Recharge Error (Fetch):', result || errorText);
          throw new Error((result && (result.error || result.message)) || errorText || `HTTP Error ${response.status}`);
      }

      // Check for application-level error returned as 200 OK
      if (result && result.success === false) {
          console.error('Recharge Failed (App Error):', result);
          throw new Error(result.error || '充值服务异常');
      }

      if (result && result.data && result.data.payment_url) {
        window.location.href = result.data.payment_url;
      } else if (result && result.error) {
        throw new Error(result.error);
      } else {
        throw new Error('未获取到支付链接');
      }
    } catch (err: any) {
      console.error('Payment Error:', err);
      setError(err.message || '充值失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRedeemInvite = async () => {
      if (!inputCode) return;
      setInviteStatus('verifying');
      setInviteError('');
      
      try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('Please login');

          const { data, error } = await supabase.functions.invoke('redeem-invite', {
              body: {
                  code: inputCode,
                  app_id: appId,
                  required_type: 'activity'
              }
          });
          
          if (error) {
              let msg = error.message || '绑定失败';
              try {
                  if (typeof error === 'object' && error !== null && 'context' in error) {
                      const context = (error as any).context;
                      if (context && typeof context.json === 'function') {
                          const json = await context.json();
                          if (json.error) msg = json.error;
                      }
                  }
              } catch (e) { /* ignore */ }

              if (msg.includes('Cannot redeem your own code')) msg = '无法绑定自己的邀请码';
              if (msg.includes('already redeemed')) msg = '您已绑定过邀请码，不可重复绑定';
              if (msg.includes('Invalid invite code')) msg = '邀请码无效，请检查后重试';

              throw new Error(msg);
          }
          
          if (data && data.success) {
              setInviteStatus('success');
              fetchInviteCode();
          } else {
              throw new Error(data?.error || data?.message || '兑换失败');
          }
          
      } catch (err: any) {
          console.error(err);
          setInviteStatus('error');
          setInviteError(err.message);
      }
  };

  // Helper to calculate bonuses
  const getBonusInfo = (product: Product) => {
      const originalBonus = product.points - product.amount;
      
      // 1. Calculate components
      let firstRechargeBonus = 0;
      if (isFirstRecharge) {
          firstRechargeBonus = Math.floor(product.amount * FIRST_RECHARGE_PERCENT);
      }
      
      // 2. Apply Frenzy Multiplier to each component (matching backend logic)
      let finalBaseBonus = originalBonus;
      let finalFirstRechargeBonus = firstRechargeBonus;
      
      // Assuming Frenzy is always active based on UI
      finalBaseBonus = Math.floor(originalBonus * FRENZY_MULTIPLIER);
      finalFirstRechargeBonus = Math.floor(firstRechargeBonus * FRENZY_MULTIPLIER);
      
      const totalBonus = finalBaseBonus + finalFirstRechargeBonus;
      
      return {
          originalBonus,
          totalBonus,
          hasExtra: totalBonus > originalBonus,
          tags: [
              isFirstRecharge && '首充+10%',
              '狂欢x1.5倍'
          ].filter(Boolean)
      };
  };

  // Cumulative Progress
  const cumulativeProgress = (recentRechargeTotal % CUMULATIVE_GOAL) / CUMULATIVE_GOAL * 100;
  const nextGoal = CUMULATIVE_GOAL - (recentRechargeTotal % CUMULATIVE_GOAL);
  const completedCycles = Math.floor(recentRechargeTotal / CUMULATIVE_GOAL);

  return (
    <div className={`bg-white rounded-2xl shadow-lg shadow-slate-200/50 overflow-hidden border border-slate-100 flex flex-col ${className || ''}`}>
      
      {/* Header Section */}
      <div className="bg-gradient-to-r from-brand-600 to-indigo-700 p-6 text-white relative overflow-hidden flex-shrink-0">
        <div className="absolute top-4 right-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-3 py-1 text-xs font-mono font-medium flex items-center gap-2 animate-pulse">
           <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
           活动仅剩 {String(timeLeft.hours).padStart(2, '0')}:{String(timeLeft.minutes).padStart(2, '0')}:{String(timeLeft.seconds).padStart(2, '0')}
        </div>

        <div className="flex flex-col gap-2 relative z-10 mt-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <LambertCoin size={32} variant="brand" className="shadow-sm rounded-full" />
              充值中心
            </h1>
            <span className="bg-gradient-to-r from-amber-300 to-orange-400 text-amber-900 px-2 py-0.5 rounded text-xs font-bold shadow-lg flex items-center gap-1">
              <Flame className="w-3 h-3 fill-amber-900" />
              限时狂欢中
            </span>
          </div>
        </div>

        {/* Activity Banners */}
        <div className="mt-6 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
             {/* First Recharge Intro Card */}
             {isFirstRecharge && (
                 <div className="bg-gradient-to-br from-rose-500/40 to-orange-500/40 backdrop-blur-md rounded-lg p-3 min-w-[180px] border border-white/30 relative overflow-hidden group">
                    <div className="text-xs text-rose-100 font-bold mb-1 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> 新人首充
                    </div>
                    <div className="text-sm font-bold text-white">额外赠送 10%</div>
                    <div className="text-[10px] text-white/70 mt-1">仅限首次充值有效</div>
                    <div className="absolute -right-2 -bottom-2 opacity-20 group-hover:scale-110 transition-transform duration-500">
                        <Coins className="w-12 h-12 text-white" />
                    </div>
                 </div>
             )}

             {/* Frenzy Intro Card */}
             <div className="bg-gradient-to-br from-amber-500/40 to-rose-500/40 backdrop-blur-md rounded-lg p-3 min-w-[180px] border border-white/30 relative overflow-hidden group">
                <div className="text-xs text-amber-100 font-bold mb-1 flex items-center gap-1">
                    <Flame className="w-3 h-3" /> 限时狂欢
                </div>
                <div className="text-sm font-bold text-white">所有赠币 x1.5 倍</div>
                <div className="text-[10px] text-white/70 mt-1">活动期间倍率已生效</div>
                <div className="absolute -right-2 -bottom-2 opacity-20 group-hover:scale-110 transition-transform duration-500">
                    <Zap className="w-12 h-12 text-white" />
                </div>
             </div>

             {/* Cumulative Progress Card */}
             <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 min-w-[240px] border border-white/20 relative overflow-hidden flex flex-col justify-center">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-brand-100 flex items-center gap-1">
                        <Crown className="w-3 h-3" /> 累计充值 ({completedCycles}轮)
                    </span>
                    <span className="text-xs text-white/90 font-mono">${recentRechargeTotal}</span>
                </div>
                <div className="w-full bg-black/20 rounded-full h-1.5 mb-1">
                    <div className="bg-amber-400 h-1.5 rounded-full transition-all duration-1000" style={{ width: `${cumulativeProgress}%` }} />
                </div>
                <div className="text-[10px] text-white/70">
                    再充值 <span className="text-white font-bold">${nextGoal}</span> 获 {CUMULATIVE_REWARD} 赠币
                </div>
             </div>

             {/* Invite Card */}
             <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 min-w-[180px] border border-white/20 relative overflow-hidden group cursor-pointer hover:bg-white/20 transition-colors"
                  onClick={() => setShowInviteInput(!showInviteInput)}>
                <div className="text-xs text-brand-200 font-bold mb-1 flex items-center gap-1">
                    <Gift className="w-3 h-3" /> 邀请有礼
                </div>
                <div className="text-sm font-bold text-white">邀请获得 50% 赠币</div>
                <div className="text-xs text-white/80 flex items-center gap-1 mt-1">
                    点击查看/填写 <ArrowRight className="w-3 h-3" />
                </div>
             </div>
        </div>
      </div>

      {/* Invite Code Section (Expandable) */}
      {showInviteInput && (
          <div className="bg-slate-50 border-b border-slate-100 p-4 animate-in slide-in-from-top-2">
              <div className="flex flex-col md:flex-row gap-4">
                  {/* My Code */}
                  <div className="flex-1 bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                      <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                          我的邀请码
                          <HelpCircle 
                            className="w-4 h-4 cursor-pointer text-slate-400 hover:text-brand-600" 
                            onClick={() => setIsActivityModalOpen(true)}
                          />
                      </div>
                      <div className="flex items-center justify-between">
                          <span 
                            className={`text-lg font-mono font-bold tracking-wider ${inviteCode === '获取失败' ? 'text-red-500 cursor-pointer underline decoration-dotted' : 'text-brand-700'}`}
                            onClick={() => {
                                if (inviteCode === '获取失败') {
                                    if (inviteCodeError) alert(`错误详情: ${inviteCodeError}`);
                                    fetchInviteCode();
                                }
                            }}
                          >
                              {inviteCode || '加载中...'}
                          </span>
                          <button 
                            onClick={() => {
                                if (inviteCode) {
                                    navigator.clipboard.writeText(inviteCode);
                                    // Optional toast
                                }
                            }}
                            className="text-slate-400 hover:text-brand-600 p-1">
                              <Copy className="w-4 h-4" />
                          </button>
                      </div>
                  </div>
                  {/* Enter Code */}
                  <div className="flex-1 bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                      <div className="text-xs text-slate-500 mb-1 flex justify-between items-center">
                          <span>填写好友邀请码</span>
                          <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium border border-amber-100">首充获赠 50% (新手体验除外)</span>
                      </div>
                      <div className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder="输入6位邀请码"
                            maxLength={6}
                            value={inputCode}
                            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                            disabled={inviteStatus === 'success'}
                            className="flex-1 border border-slate-200 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-brand-500"
                          />
                          <button 
                            onClick={handleRedeemInvite}
                            disabled={!inputCode || inviteStatus === 'success' || inviteStatus === 'verifying'}
                            className="bg-brand-600 text-white text-xs px-3 py-1 rounded hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                              {inviteStatus === 'verifying' ? '...' : inviteStatus === 'success' ? '已绑定' : '绑定'}
                          </button>
                      </div>
                      {inviteStatus === 'success' && <div className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> 邀请码已绑定，首充后生效</div>}
                      {inviteStatus === 'error' && <div className="text-xs text-red-500 mt-1">{inviteError}</div>}
                  </div>
              </div>
          </div>
      )}

      {/* Content */}
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {[...products].sort((a, b) => {
              const isExperienceA = a.amount === 1;
              const isExperienceB = b.amount === 1;
              
              if (hasPurchasedExperience) {
                  if (isExperienceA && !isExperienceB) return 1;
                  if (!isExperienceA && isExperienceB) return -1;
              }
              return 0;
          }).map((product) => {
            const isSelected = selectedProduct?.id === product.id;
            const config = PRODUCT_CONFIG[product.amount] || { 
              title: product.name, 
              buttonText: '立即充值', 
              icon: Sparkles
            };
            const Icon = config.icon || Sparkles;
            const { originalBonus, totalBonus, hasExtra, tags } = getBonusInfo(product);

            const isExperienceProduct = product.amount === 1;
            const isSoldOut = isExperienceProduct && hasPurchasedExperience;

            let cardStateClass = isSelected 
                ? "bg-white border-brand-500 shadow-xl shadow-brand-500/10 ring-1 ring-brand-500 transform scale-[1.02]"
                : "bg-white border-slate-100 hover:border-brand-200 hover:shadow-lg";
            
            if (config.isPremium) {
                cardStateClass = isSelected 
                    ? "bg-gradient-to-br from-[#FFF9F0] to-[#FFE8CC] border-amber-400 shadow-amber-200/50 ring-1 ring-amber-400 scale-[1.02]"
                    : "bg-gradient-to-br from-white to-amber-50 border-amber-100 hover:border-amber-300";
            }

            if (isSoldOut) {
                cardStateClass = "bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed grayscale";
            }

            return (
              <button
                key={product.id}
                onClick={() => !isSoldOut && handleProductSelect(product)}
                disabled={isSoldOut}
                className={`relative group rounded-2xl border-2 transition-all duration-300 text-left flex flex-col h-full overflow-hidden ${cardStateClass}`}
              >
                {/* Sold Out Overlay */}
                {isSoldOut && (
                    <div className="absolute inset-0 bg-slate-100/10 z-30 flex items-center justify-center backdrop-blur-[1px]">
                        <span className="bg-slate-800 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg transform -rotate-12">
                            每人限购一次
                        </span>
                    </div>
                )}

                {/* First Recharge Badge */}
                {isFirstRecharge && Math.floor(product.amount * FIRST_RECHARGE_PERCENT) > 0 && (
                    <div className="absolute top-0 right-0 bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg z-20">
                        新人首充
                    </div>
                )}

                <div className="p-5 flex flex-col h-full w-full relative z-10">
                    <div className="flex justify-between items-center mb-4 w-full">
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg ${config.isPremium ? 'bg-amber-100/50' : 'bg-slate-100 group-hover:bg-brand-50'}`}>
                                <Icon className={`w-5 h-5 ${config.isPremium ? 'text-amber-500' : 'text-slate-400 group-hover:text-brand-500'}`} />
                            </div>
                            <span className={`font-bold ${config.isPremium ? 'text-amber-900' : 'text-slate-700'}`}>{config.title}</span>
                        </div>
                    </div>

                    <div className="mb-4">
                        <div className="flex items-baseline gap-1">
                            <span className="text-lg font-bold text-slate-400">$</span>
                            <span className={`text-4xl font-extrabold ${config.isPremium ? 'text-amber-900' : 'text-slate-900'}`}>{product.amount}</span>
                        </div>
                    </div>

                    <div className="mt-auto space-y-2">
                        <div className={`flex justify-between items-center p-2 rounded-lg ${config.isPremium ? 'bg-amber-50' : 'bg-slate-50'}`}>
                            <span className="text-xs text-slate-500">到账</span>
                            <div className="text-right">
                                <div className={`font-bold ${config.isPremium ? 'text-amber-700' : 'text-brand-700'}`}>
                                    {product.amount + totalBonus} 朗伯币
                                </div>
                                {hasExtra && (
                                    <div className="text-[10px] text-slate-400 line-through">
                                        原到账 {product.points}
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        {/* Bonus Tags */}
                        {hasExtra && (
                            <div className="flex flex-wrap gap-1">
                                {tags.map((tag, i) => (
                                    <span key={i} className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-600">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2 animate-pulse">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
            {error}
          </div>
        )}

        <Button
          size="lg"
          className="w-full text-lg font-bold py-6 shadow-xl shadow-brand-500/20 hover:shadow-brand-500/40 hover:-translate-y-0.5 transition-all"
          onClick={handleRecharge}
          disabled={loading || (selectedProduct?.amount === 1 && hasPurchasedExperience)}
          loading={loading}
        >
          {loading ? '正在创建订单...' : (selectedProduct?.amount === 1 && hasPurchasedExperience) ? '每人限购一次' : `支付 $${amount} 立即充值`}
        </Button>
      </div>

      <Modal
        isOpen={isActivityModalOpen}
        onClose={() => setIsActivityModalOpen(false)}
        title="邀请有礼活动规则"
      >
        <div className="space-y-6 text-sm text-gray-600">
            <div>
                <h4 className="font-bold text-gray-900 mb-2">一、参与方式</h4>
                <p>
                    复制您的专属邀请码分享给好友。好友在充值页面填写您的邀请码并点击“绑定”按钮，即可建立关联。
                </p>
                <p className="mt-2 text-amber-600 font-medium bg-amber-50 p-2 rounded border border-amber-100">
                    ⚠️ 注意：邀请码一旦绑定成功，将无法修改或解绑。请务必在绑定前确认邀请码正确。
                </p>
            </div>

            <div>
                <h4 className="font-bold text-gray-900 mb-2">二、奖励机制</h4>
                <ul className="list-disc pl-5 space-y-2">
                    <li>
                        <span className="font-medium text-gray-900">返利对象：</span>
                        奖励将发放给<span className="font-bold text-brand-600">邀请码所属的用户（邀请人）</span>。
                    </li>
                    <li>
                        <span className="font-medium text-gray-900">返利比例：</span>
                        当被邀请人完成<span className="text-brand-600 font-bold">首次充值</span>时，系统将向邀请人返还充值金额的 <span className="text-brand-600 font-bold">50%</span> 作为朗伯币奖励。
                    </li>
                    <li>
                        <span className="font-medium text-gray-900">排除项：</span>
                        <span className="text-amber-600 font-bold">新手体验包（$1及以下金额）</span>属于特惠商品，不参与首充返利活动。
                    </li>
                </ul>
            </div>

            <div>
                <h4 className="font-bold text-gray-900 mb-2">三、反作弊与限制</h4>
                <ul className="list-disc pl-5 space-y-1">
                    <li>
                        同一用户（同一设备、IP、支付账号）仅能绑定一次邀请码。
                    </li>
                    <li>
                        禁止用户绑定自己的邀请码。
                    </li>
                    <li>
                        严禁通过恶意注册、模拟器刷量等手段获取奖励。一经发现，平台有权取消所有奖励并冻结相关账号。
                    </li>
                </ul>
            </div>
            
            <div className="pt-4 border-t text-xs text-gray-400 text-center">
                本活动最终解释权归平台所有
            </div>
        </div>
      </Modal>
    </div>
  );
}
