import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Loader2, CreditCard, Sparkles, Zap, Crown, Gift, Coins, Flame } from 'lucide-react';
import { Button } from './Button';
import { supabase } from '../lib/supabase';

interface Product {
  id: string;
  name: string;
  amount: number;
  points: number;
  description: string;
  tag?: string;
  button_text?: string;
}

interface RechargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
}

// Activity Constants
const FRENZY_MULTIPLIER = 1.5;
const FIRST_RECHARGE_PERCENT = 0.10;

export function RechargeDialog({ open, onOpenChange, appId }: RechargeDialogProps) {
  const [amount, setAmount] = useState<number>(10);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFirstRecharge, setIsFirstRecharge] = useState(false);
  const [hasPurchasedExperience, setHasPurchasedExperience] = useState(false);

  useEffect(() => {
    if (open) {
      // Fetch Products
      supabase
        .from('recharge_products')
        .select('*')
        .eq('is_active', true)
        .order('amount', { ascending: true })
        .then(({ data, error }) => {
          if (data) {
            setProducts(data);
            if (data.length > 0) {
              setSelectedProduct(data[0]);
              setAmount(data[0].amount);
            }
          }
        });

      // Check First Recharge Status
      const checkFirstRecharge = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { count, error: countError } = await supabase
            .from('platform_orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'paid');
        
        if (!countError) {
            setIsFirstRecharge(count === 0);
        }

        // Check if user has purchased the 'New User Experience' (amount = 1)
        let hasPurchased = false;

        // 1. Direct query (needs RLS)
        const { count: experienceCount, error: experienceError } = await supabase
            .from('platform_orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'paid')
            .eq('amount', 100); // 100 cents = $1
        
        if (!experienceError && experienceCount !== null && experienceCount > 0) {
            hasPurchased = true;
        }

        // 2. RPC fallback (bypasses RLS via SECURITY DEFINER)
        if (!hasPurchased) {
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
      };
      checkFirstRecharge();
    }
  }, [open]);

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

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product);
    setAmount(product.amount);
  };

  const handleRecharge = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error('请先登录');
      
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw new Error('会话已过期，请刷新页面');
      
      const currentSession = refreshData.session || session;
      const token = currentSession.access_token;

      const returnUrl = `${window.location.origin}/dashboard/wallet?status=success`;

      const requestPayload = {
        app_id: appId, 
        return_url: returnUrl,
        amount: amount,
        product_id: selectedProduct?.id
      };

      console.log('Initiating recharge request...', requestPayload);

      const { data: result, error: invokeError } = await supabase.functions.invoke('create-recharge-order', {
        body: requestPayload,
        headers: {
            Authorization: `Bearer ${token}`
        }
      });


      if (invokeError) {
        console.error('Recharge Error Details:', invokeError);
        let msg = invokeError.message || '充值服务暂时不可用';
        try {
            if (invokeError && typeof invokeError === 'object' && 'context' in invokeError) {
                const context = (invokeError as any).context;
                if (context && typeof context.text === 'function') {
                    const text = await context.text();
                    console.error('Raw Error Response:', text);
                    try {
                        const json = JSON.parse(text);
                        if (json.error) msg = json.error;
                        else if (json.message) msg = json.message;
                    } catch (jsonErr) {
                        // Not JSON, use text if short and not HTML
                        if (text && text.length < 200 && !text.trim().startsWith('<')) {
                             msg = text;
                        } else {
                             msg = `Server Error: ${invokeError.message}`;
                        }
                    }
                }
            }
        } catch (e) { 
            console.error('Error parsing failed:', e);
        }
        throw new Error(msg);
      }

      if (result.data?.payment_url) {
        window.location.href = result.data.payment_url;
      } else {
        throw new Error('未获取到支付链接，请稍后重试或联系客服');
      }

    } catch (err: any) {
      console.error('Recharge error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getProductIcon = (name: string) => {
    if (name.includes('新手')) return <Sparkles className="w-4 h-4 text-brand-500" />;
    if (name.includes('轻量')) return <Coins className="w-4 h-4 text-amber-600" />;
    if (name.includes('人气')) return <Flame className="w-4 h-4 text-rose-500" />;
    if (name.includes('进阶')) return <Zap className="w-4 h-4 text-yellow-500" />;
    if (name.includes('尊享')) return <Gift className="w-4 h-4 text-purple-500" />;
    if (name.includes('至尊')) return <Crown className="w-4 h-4 text-amber-400" />;
    return <CreditCard className="w-4 h-4 text-slate-500" />;
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
        <Dialog.Content className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-4xl bg-white rounded-2xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-200 overflow-hidden max-h-[90vh] flex flex-col">
          
          {/* Header Section */}
          <div className="bg-gradient-to-r from-brand-600 to-indigo-700 p-6 text-white relative overflow-hidden flex-shrink-0">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <CreditCard className="w-32 h-32 rotate-12" />
            </div>
            
            <div className="flex justify-between items-start relative z-10">
              <div>
                <Dialog.Title className="text-2xl font-bold flex items-center gap-2 mb-2">
                  <CreditCard className="w-6 h-6" />
                  朗伯币充值
                </Dialog.Title>
                <p className="text-brand-100 text-sm font-medium">1 USD = 1 朗伯币 • 充越多，赠越多，畅享平台全部服务</p>
              </div>
              <Dialog.Close asChild>
                <button className="text-white/70 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10">
                  <X className="w-6 h-6" />
                </button>
              </Dialog.Close>
            </div>

            {/* Promo Banner */}
            <div className="mt-6 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 min-w-[200px] border border-white/20">
                <div className="text-xs text-brand-200 font-bold mb-1">新人首充福利 🎊</div>
                <div className="text-sm font-medium">首次充值任意档位</div>
                <div className="text-xs text-white/80">额外再赠 10%</div>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 min-w-[200px] border border-white/20">
                <div className="text-xs text-brand-200 font-bold mb-1">限时狂欢加成 🚀</div>
                <div className="text-sm font-medium">活动期间充值</div>
                <div className="text-xs text-white/80">赠送部分 ×1.5 倍</div>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 min-w-[200px] border border-white/20">
                <div className="text-xs text-brand-200 font-bold mb-1">累计充值好礼 🎁</div>
                <div className="text-sm font-medium">7 天内累计满 $200</div>
                <div className="text-xs text-white/80">额外赠送 30 朗伯币</div>
              </div>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="p-6 overflow-y-auto flex-1">
            {/* Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {products.map((product) => {
                const isSelected = selectedProduct?.id === product.id;
                const { originalBonus, totalBonus, hasExtra, tags } = getBonusInfo(product);

                const isExperienceProduct = product.amount === 1;
                const isSoldOut = isExperienceProduct && hasPurchasedExperience;
                
                return (
                  <button
                    key={product.id}
                    onClick={() => !isSoldOut && handleProductSelect(product)}
                    disabled={isSoldOut}
                    className={`relative group p-4 rounded-xl border-2 transition-all duration-200 text-left flex flex-col h-full ${
                      isSelected
                        ? 'bg-brand-50 border-brand-500 shadow-md scale-[1.02]'
                        : 'bg-white border-slate-100 hover:border-brand-200 hover:shadow-sm'
                    } ${isSoldOut ? 'opacity-60 cursor-not-allowed grayscale bg-slate-50' : ''}`}
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
                    {isFirstRecharge && (
                        <div className="absolute top-0 left-0 bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-br-lg rounded-tl-lg z-20 shadow-sm">
                            新人首充
                        </div>
                    )}
                    {/* Tags */}
                    {hasExtra && (
                        <div className="absolute top-0 right-0 z-20 flex flex-col items-end gap-1 p-1">
                            {tags.map((tag, i) => (
                                <span key={i} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500 text-white shadow-sm">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    {isSelected && (
                      <div className="absolute -top-3 -right-3 bg-brand-500 text-white p-1 rounded-full shadow-md z-30">
                        <CheckIcon className="w-4 h-4" />
                      </div>
                    )}
                    
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-1.5">
                        {getProductIcon(product.name)}
                        <span className={`font-bold text-sm ${isSelected ? 'text-brand-700' : 'text-slate-700'}`}>
                          {product.tag?.split('・')[0] || product.name}
                        </span>
                      </div>
                      {product.tag?.includes('・') && (
                        <span className="text-lg">{product.tag.split('・')[1]}</span>
                      )}
                    </div>

                    <div className="mb-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm text-slate-500 font-medium">$</span>
                        <span className="text-3xl font-extrabold text-slate-900">{product.amount}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        实付：${product.amount}
                      </div>
                    </div>

                    <div className="mt-auto space-y-2">
                      <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg group-hover:bg-brand-100/30 transition-colors">
                        <span className="text-xs text-slate-500">到账</span>
                        <div className="text-right">
                            <span className="font-bold text-brand-700 block">{product.amount + totalBonus} 朗伯币</span>
                            {hasExtra && (
                                <span className="text-[10px] text-slate-400 line-through">
                                    原到账 {product.points}
                                </span>
                            )}
                        </div>
                      </div>
                      
                      {hasExtra && (
                        <div className="flex justify-between items-center px-2">
                          <span className="text-xs text-slate-400">多赠</span>
                          <span className="text-xs font-bold text-amber-500">+{totalBonus - originalBonus} 朗伯币</span>
                        </div>
                      )}
                      
                      <div className="pt-2 text-xs text-slate-400 border-t border-slate-100 mt-2 min-h-[20px]">
                        {product.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-xl flex items-start gap-3">
                <div className="mt-0.5 min-w-[16px]"><X className="w-4 h-4" /></div>
                <div className="text-sm font-medium">{error}</div>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="text-sm text-slate-600">
                <span className="mr-4">支付金额：<strong className="text-slate-900 text-lg">${amount}</strong></span>
                <span>预计到账：<strong className="text-emerald-600 text-lg">{selectedProduct ? selectedProduct.points : amount} 朗伯币</strong></span>
              </div>
              
              <Button
                onClick={handleRecharge}
                disabled={loading || amount <= 0 || (selectedProduct?.amount === 1 && hasPurchasedExperience)}
                className="w-full md:w-auto px-8 py-3 text-base font-bold shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30 transition-all transform active:scale-95"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    正在创建订单...
                  </>
                ) : (
                  selectedProduct?.button_text || '立即充值'
                )}
              </Button>
            </div>

            {/* Footer Notes */}
            <div className="mt-8 text-center md:text-left">
              <div className="text-[10px] text-slate-400 space-y-1">
                <p>📌 朗伯币为平台内积分代币，仅限 APP 内使用</p>
                <p>• 不可提现、不可交易、不可兑换现金</p>
                <p>• 充值实时到账，赠送为平台福利</p>
                <p>• 活动最终解释权归平台所有</p>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CheckIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
