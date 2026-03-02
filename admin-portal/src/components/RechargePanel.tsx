import { useState, useEffect } from 'react';
import { Button } from './Button';
import { supabase } from '../lib/supabase';
import { Flame, Crown, Coins, Sparkles, Zap, Gift, ShieldCheck } from 'lucide-react';
import { LambertCoin } from './LambertCoin';
import { RechargeAgreementDialog } from './RechargeAgreementDialog';

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

// UI Configuration Map based on user request
const PRODUCT_CONFIG: Record<number, {
  title: string;
  buttonText: string;
  bonusText: string;
  highlight?: boolean;
  isPremium?: boolean;
  icon?: any;
}> = {
  1: { title: '新手体验', buttonText: '立即体验', bonusText: '赠送：——', icon: Sparkles },
  5: { title: '轻量入门', buttonText: '特惠充值', bonusText: '赠送：+1', highlight: true, icon: Coins },
  10: { title: '人气爆款', buttonText: '立即抢购', bonusText: '赠送：+2', highlight: true, icon: Flame },
  20: { title: '进阶畅玩', buttonText: '推荐充值', bonusText: '赠送：+5', icon: Zap },
  50: { title: '尊享优选', buttonText: '尊享充值', bonusText: '赠送：+15', isPremium: true, icon: Gift },
  100: { title: '至尊专属', buttonText: '立即开通', bonusText: '赠送：+35', highlight: true, isPremium: true, icon: Crown },
};

export function RechargePanel({ appId, className }: RechargePanelProps) {
  const [amount, setAmount] = useState<number>(10);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAgreement, setShowAgreement] = useState(false);
  
  // Countdown Timer Logic
  const [timeLeft, setTimeLeft] = useState<{hours: number, minutes: number, seconds: number}>({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    // Initialize countdown to end of day or specific time
    const calculateTimeLeft = () => {
      const now = new Date();
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      
      const diff = endOfDay.getTime() - now.getTime();
      
      if (diff > 0) {
        return {
          hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((diff / 1000 / 60) % 60),
          seconds: Math.floor((diff / 1000) % 60)
        };
      }
      return { hours: 0, minutes: 0, seconds: 0 };
    };

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    supabase
      .from('recharge_products')
      .select('*')
      .eq('is_active', true)
      .order('amount', { ascending: true })
      .then(({ data, error }) => {
        if (data) {
          setProducts(data);
          // Default select the $30 option if available, otherwise first
          const defaultProduct = data.find(p => p.amount === 30) || data[0];
          if (defaultProduct) {
            setSelectedProduct(defaultProduct);
            setAmount(defaultProduct.amount);
          }
        }
      });
  }, []);

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product);
    setAmount(product.amount);
  };

  const handleRecharge = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('请先登录');

      const returnUrl = `${window.location.origin}/dashboard/wallet?status=success`;

      const requestPayload = {
        app_id: appId, 
        return_url: returnUrl,
        amount: amount,
        product_id: selectedProduct?.id
      };

      console.log('Initiating recharge request...', requestPayload);

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-recharge-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(requestPayload)
      });

      let result;
      const text = await response.text();
      
      try {
        result = JSON.parse(text);
      } catch (e) {
        throw new Error(`服务器响应格式错误: ${text.substring(0, 50)}...`);
      }
      
      if (!response.ok) {
        throw new Error(result.error || `请求失败 (${response.status})`);
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

  // Get current config based on selection
  const currentConfig = selectedProduct ? PRODUCT_CONFIG[selectedProduct.amount] : null;

  return (
    <div className={`bg-white rounded-2xl shadow-lg shadow-slate-200/50 overflow-hidden border border-slate-100 flex flex-col ${className || ''}`}>
      
      {/* Header Section */}
      <div className="bg-gradient-to-r from-brand-600 to-indigo-700 p-6 text-white relative overflow-hidden flex-shrink-0">
        
        {/* Countdown Overlay */}
        <div className="absolute top-4 right-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-3 py-1 text-xs font-mono font-medium flex items-center gap-2 animate-pulse">
           <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
           活动仅剩 {String(timeLeft.hours).padStart(2, '0')}:{String(timeLeft.minutes).padStart(2, '0')}:{String(timeLeft.seconds).padStart(2, '0')}
        </div>

        <div className="flex flex-col gap-2 relative z-10 mt-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <LambertCoin size={32} variant="brand" className="shadow-sm rounded-full" />
              朗伯币充值中心
            </h1>
            <span className="bg-gradient-to-r from-amber-300 to-orange-400 text-amber-900 px-2 py-0.5 rounded text-xs font-bold shadow-lg flex items-center gap-1">
              <Flame className="w-3 h-3 fill-amber-900" />
              限时狂欢・多福利叠加
            </span>
          </div>
          <p className="text-brand-100 text-sm font-medium flex items-center gap-1">
            1 USD = 1 <LambertCoin size={16} variant="plain" className="text-brand-200" /> 朗伯币・充越多・赠越多
          </p>
        </div>

        {/* Promo Banner - With Icons */}
        <div className="mt-6 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {/* Newcomer */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 min-w-[180px] border border-white/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-1 opacity-10 group-hover:opacity-20 transition-opacity">
               <Sparkles className="w-8 h-8 text-white" />
            </div>
            <div className="text-xs text-brand-200 font-bold mb-1 flex items-center gap-1">
              <Gift className="w-3 h-3" /> 新人首充福利
            </div>
            <div className="text-sm font-medium">首次充值任意档位</div>
            <div className="text-xs text-white/80">额外再赠 10%</div>
          </div>
          {/* Limited Time */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 min-w-[180px] border border-white/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-1 opacity-10 group-hover:opacity-20 transition-opacity">
               <Flame className="w-8 h-8 text-white" />
            </div>
            <div className="text-xs text-brand-200 font-bold mb-1 flex items-center gap-1">
              <Zap className="w-3 h-3" /> 限时狂欢加成
            </div>
            <div className="text-sm font-medium">活动期间充值</div>
            <div className="text-xs text-white/80">赠送部分 ×1.5 倍</div>
          </div>
          {/* Accumulated */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 min-w-[180px] border border-white/20 relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-1 opacity-10 group-hover:opacity-20 transition-opacity">
               <Coins className="w-8 h-8 text-white" />
            </div>
            <div className="text-xs text-brand-200 font-bold mb-1 flex items-center gap-1">
              <Crown className="w-3 h-3" /> 累计充值好礼
            </div>
            <div className="text-sm font-medium">7 天内累计满 $200</div>
            <div className="text-xs text-white/80">额外赠送 30 朗伯币</div>
          </div>
           {/* Invite */}
           <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 min-w-[180px] border border-white/20 relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-1 opacity-10 group-hover:opacity-20 transition-opacity">
               <Gift className="w-8 h-8 text-white" />
            </div>
            <div className="text-xs text-brand-200 font-bold mb-1 flex items-center gap-1">
               <Sparkles className="w-3 h-3" /> 邀请有礼
            </div>
            <div className="text-sm font-medium">邀请好友成功充值</div>
            <div className="text-xs text-white/80">双方各得 20 朗伯币</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Products Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {products.map((product) => {
            const isSelected = selectedProduct?.id === product.id;
            const config = PRODUCT_CONFIG[product.amount] || { 
              title: product.name, 
              buttonText: '立即充值', 
              bonusText: `赠送：${product.points > product.amount ? '+' + (product.points - product.amount) : '——'}`,
              icon: Sparkles
            };
            const Icon = config.icon || Sparkles;
            
            // Determine styles based on tier and selection
            let cardBaseClass = "relative group rounded-2xl border-2 transition-all duration-300 text-left flex flex-col h-full overflow-hidden hover:-translate-y-1";
            let cardStateClass = "";
            let iconClass = "w-5 h-5";
            let titleClass = "font-bold text-base";
            let priceClass = "text-3xl font-extrabold tracking-tight";
            let bonusClass = "text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit";

            if (config.isPremium) {
                // Premium Gold/Dark style
                cardStateClass = isSelected 
                    ? "bg-gradient-to-br from-[#FFF9F0] via-[#FFF5E0] to-[#FFE8CC] border-amber-400 shadow-amber-200/50 shadow-xl scale-[1.02] ring-2 ring-amber-200/50 ring-offset-2" 
                    : "bg-gradient-to-br from-white to-amber-50/50 border-amber-100 hover:border-amber-300 hover:shadow-lg hover:shadow-amber-100/40";
                
                iconClass = "w-5 h-5 text-amber-500 fill-amber-500/20";
                titleClass = isSelected ? "font-bold text-base text-amber-900" : "font-bold text-base text-slate-700 group-hover:text-amber-800";
                priceClass = isSelected ? "text-4xl font-extrabold text-amber-900" : "text-4xl font-extrabold text-slate-900 group-hover:text-amber-900";
                bonusClass = "text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 w-fit bg-amber-100 text-amber-700 border border-amber-200/50";
            } else {
                // Standard style
                cardStateClass = isSelected
                    ? "bg-white border-brand-500 shadow-xl shadow-brand-500/10 scale-[1.02] ring-2 ring-brand-100 ring-offset-2"
                    : "bg-white border-slate-100 hover:border-brand-200 hover:shadow-lg hover:shadow-slate-200/50";
                 
                iconClass = isSelected ? "w-5 h-5 text-brand-600 fill-brand-100" : "w-5 h-5 text-slate-400 group-hover:text-brand-500 transition-colors";
                titleClass = isSelected ? "font-bold text-base text-brand-700" : "font-bold text-base text-slate-700 group-hover:text-brand-700 transition-colors";
                priceClass = isSelected ? "text-4xl font-extrabold text-slate-900" : "text-4xl font-extrabold text-slate-900";
                bonusClass = "text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 w-fit bg-rose-50 text-rose-600 border border-rose-100";
            }
            
            return (
              <button
                key={product.id}
                onClick={() => handleProductSelect(product)}
                className={`${cardBaseClass} ${cardStateClass}`}
              >
                {/* Premium Background Decoration */}
                {config.isPremium && (
                   <>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-200/20 to-orange-300/20 rounded-bl-[100px] blur-2xl group-hover:scale-125 transition-transform duration-700 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-amber-100/30 to-transparent rounded-tr-[80px] blur-xl pointer-events-none" />
                   </>
                )}

                <div className="p-5 flex flex-col h-full w-full relative z-10">
                    {/* Header: Icon + Title + Tag */}
                    <div className="flex justify-between items-center mb-4 w-full">
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg ${config.isPremium ? 'bg-amber-100/50' : 'bg-slate-100 group-hover:bg-brand-50 transition-colors'}`}>
                                <Icon className={iconClass} />
                            </div>
                            <span className={titleClass}>{config.title}</span>
                        </div>
                        {config.highlight && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                config.isPremium 
                                ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white border-transparent shadow-sm' 
                                : 'bg-rose-50 text-rose-600 border-rose-100'
                            }`}>
                                热卖
                            </span>
                        )}
                    </div>

                    {/* Main Price Area */}
                    <div className="flex items-baseline gap-1 mb-1">
                        <span className={`text-lg font-bold ${config.isPremium ? 'text-amber-900/60' : 'text-slate-400'}`}>$</span>
                        <span className={priceClass}>{product.amount}</span>
                    </div>
                    <div className={`text-xs mb-4 ${config.isPremium ? 'text-amber-800/60' : 'text-slate-400'}`}>
                        实付：${product.amount}
                    </div>

                    {/* Divider */}
                    <div className={`w-full h-px mb-4 ${config.isPremium ? 'bg-amber-200/30' : 'bg-slate-100'}`} />

                    {/* Benefits Section */}
                    <div className="space-y-3 flex-grow">
                        <div className="flex justify-between items-center">
                            <span className={`text-sm ${config.isPremium ? 'text-amber-800/70' : 'text-slate-500'}`}>到账</span>
                            <div className={`text-lg font-bold ${config.isPremium ? 'text-amber-900' : 'text-slate-900'} flex items-center gap-1`}>
                                {product.points} 
                                <LambertCoin size={16} variant={config.isPremium ? 'gold' : 'brand'} />
                                <span className="text-xs font-normal opacity-70">朗伯币</span>
                            </div>
                        </div>
                        
                        <div className="flex justify-between items-center min-h-[24px]">
                             <span className={`text-sm ${config.isPremium ? 'text-amber-800/70' : 'text-slate-500'}`}>
                                {config.bonusText.includes('+') ? '赠送' : ''}
                             </span>
                             
                             {config.bonusText.includes('+') ? (
                                <div className={bonusClass}>
                                     <Flame className="w-3 h-3 fill-current" />
                                     <span>{config.bonusText.replace('赠送：', '')}</span>
                                </div>
                             ) : (
                                <span className={`text-xs ${config.isPremium ? 'text-amber-800/40' : 'text-slate-300'}`}>——</span>
                             )}
                        </div>
                    </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-xl flex items-start gap-3">
            <div className="text-sm font-medium">{error}</div>
          </div>
        )}

        {/* Action Bar (Main Payment Button) */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
          <div className="text-sm text-slate-600 flex flex-wrap gap-4 items-center">
            <span>支付金额：<strong className="text-slate-900 text-lg">${amount}</strong></span>
            <span className="flex items-center gap-1">
                预计到账：
                <strong className="text-emerald-600 text-lg flex items-center gap-1">
                    {selectedProduct ? selectedProduct.points : amount} 
                    <LambertCoin size={20} variant="brand" />
                </strong>
            </span>
          </div>
          
          <Button
            onClick={handleRecharge}
            disabled={loading || amount <= 0}
            className={`w-full md:w-auto px-8 py-3 text-base font-bold shadow-lg transition-all transform active:scale-95 rounded-full ${
                currentConfig?.isPremium 
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:shadow-amber-500/30 text-white border-none' 
                : 'bg-gradient-to-r from-brand-600 to-indigo-600 hover:shadow-brand-500/30 text-white border-none'
            }`}
          >
            {loading ? (
              <>
                正在创建订单...
              </>
            ) : (
              currentConfig?.buttonText || '立即充值'
            )}
          </Button>
        </div>

        {/* Footer Notes (Compliance Version) */}
        <div className="mt-8 pt-6 border-t border-slate-100/50">
          <div className="flex items-start gap-3">
             <div className="mt-1 flex-shrink-0 text-slate-400">
                <ShieldCheck className="w-4 h-4" />
             </div>
             <div className="text-xs text-slate-500 space-y-1">
                <p className="leading-relaxed">
                  点击充值即代表您已阅读并同意
                  <button 
                    onClick={() => setShowAgreement(true)}
                    className="text-brand-600 hover:text-brand-700 font-semibold underline underline-offset-2 ml-1 cursor-pointer transition-colors"
                  >
                    《平台积分充值及使用协议》
                  </button>
                </p>
                <p className="text-[10px] text-slate-400 leading-tight">
                  本平台积分仅用于兑换服务，严禁用于任何非法交易、炒作或提现。未成年人请在监护人陪同下操作。
                  <br />
                  充值实时到账，赠送部分为平台福利，活动最终解释权归平台所有。
                </p>
             </div>
          </div>
        </div>
      </div>

      <RechargeAgreementDialog open={showAgreement} onOpenChange={setShowAgreement} />
    </div>
  );
}
