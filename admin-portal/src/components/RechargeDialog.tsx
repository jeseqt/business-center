import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Loader2, CreditCard } from 'lucide-react';
import { Button } from './Button';
import { supabase } from '../lib/supabase';

const AMOUNTS = [10, 20, 50, 100];

interface RechargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
}

export function RechargeDialog({ open, onOpenChange, appId }: RechargeDialogProps) {
  const [amount, setAmount] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecharge = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('请先登录');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-recharge-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ amount, app_id: appId })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || '充值请求失败');
      }

      // Redirect to payment URL
      if (result.data?.payment_url) {
        window.location.href = result.data.payment_url;
      } else {
        throw new Error('未获取到支付链接');
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
        <Dialog.Content className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-md bg-white rounded-2xl shadow-xl p-6 z-50 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-6">
            <Dialog.Title className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-brand-600" />
              充值钱包
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-6">
            {/* Amount Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">选择充值金额 (USD)</label>
              <div className="grid grid-cols-4 gap-3 mb-4">
                {AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setAmount(amt)}
                    className={`py-2 px-3 rounded-xl border transition-all font-bold ${
                      amount === amt
                        ? 'bg-brand-50 border-brand-500 text-brand-600 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                <input
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full pl-8 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-bold text-slate-900"
                  placeholder="输入自定义金额"
                />
              </div>
            </div>

            {/* Exchange Rate Info */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm text-slate-600 space-y-2">
              <div className="flex justify-between">
                <span>支付金额:</span>
                <span className="font-bold text-slate-900">${amount}</span>
              </div>
              <div className="flex justify-between">
                <span>预计到账:</span>
                <span className="font-bold text-emerald-600">{amount} 朗伯币</span>
              </div>
              <div className="pt-2 border-t border-slate-200 text-xs text-slate-400 flex justify-between items-center">
                <span>汇率: 1 USD = 1 朗伯币</span>
                <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-bold">BagelPay</span>
              </div>
            </div>

            {error && (
              <div className="text-rose-600 text-sm bg-rose-50 p-3 rounded-lg border border-rose-100 flex items-start gap-2">
                <div className="mt-0.5 min-w-[4px] h-[4px] rounded-full bg-rose-500" />
                {error}
              </div>
            )}

            <Button
              onClick={handleRecharge}
              disabled={loading || amount <= 0}
              className="w-full py-6 text-lg rounded-xl shadow-lg shadow-brand-500/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  处理中...
                </>
              ) : (
                '立即充值'
              )}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
