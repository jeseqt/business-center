import * as Dialog from '@radix-ui/react-dialog';
import { X, History, Loader2, ArrowUpRight, ArrowDownLeft, Clock, Gift, CreditCard, Receipt, Users, ShieldAlert } from 'lucide-react';
import { Button } from './Button';
import { PlatformWalletTransaction } from '../types/shared';
import { cn } from '../lib/utils';

interface TransactionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: PlatformWalletTransaction[];
  loading: boolean;
}

const getTransactionLabel = (type: string) => {
  switch (type) {
    case 'deposit': return '充值';
    case 'usage': return '消费';
    case 'reward': return '活动赠送';
    case 'cumulative_reward': return '累计充值奖励';
    case 'invite_reward': return '邀请奖励';
    case 'refund': return '退款';
    case 'admin_adjustment': return '管理员调整';
    default: return type;
  }
};

const getTransactionIcon = (type: string) => {
  switch (type) {
    case 'deposit': return <CreditCard className="w-4 h-4" />;
    case 'usage': return <Receipt className="w-4 h-4" />;
    case 'reward': 
    case 'cumulative_reward': return <Gift className="w-4 h-4" />;
    case 'invite_reward': return <Users className="w-4 h-4" />;
    case 'admin_adjustment': return <ShieldAlert className="w-4 h-4" />;
    default: return <ArrowUpRight className="w-4 h-4" />;
  }
};

const formatDescription = (desc: string | undefined, type: string) => {
  if (!desc) return '';
  
  if (desc.startsWith('Recharge via BagelPay:')) {
    return desc.replace('Recharge via BagelPay:', '订单号:');
  }
  if (desc.startsWith('Activity Bonus:')) {
    return desc.replace('Activity Bonus:', '包含:');
  }
  if (desc.includes('First Recharge Bonus')) {
    return '首充奖励';
  }
  if (desc.includes('Cumulative Recharge Reward')) {
    return '累计充值达标奖励';
  }
  if (desc.startsWith('Invite Reward from user')) {
    return '邀请新用户奖励';
  }
  
  return desc;
};

export function TransactionsDialog({ open, onOpenChange, transactions, loading }: TransactionsDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-white p-6 shadow-lg duration-200 sm:rounded-xl animate-in fade-in zoom-in-95 slide-in-from-left-1/2 slide-in-from-top-[48%]">
          <div className="flex flex-col space-y-1.5 text-center sm:text-left mb-4">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
                <History className="w-5 h-5 text-brand-600" />
                最近交易记录
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                  <X className="h-4 w-4" />
                  <span className="sr-only">关闭</span>
                </Button>
              </Dialog.Close>
            </div>
          </div>
          
          <div className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {loading ? (
              <div className="h-40 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-brand-500 animate-spin opacity-50" />
              </div>
            ) : transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions.map((tx) => {
                  const isDeposit = tx.type === 'deposit';
                  const isReward = tx.type === 'reward' || tx.type === 'cumulative_reward' || tx.type === 'invite_reward';
                  const isUsage = tx.type === 'usage';
                  
                  return (
                    <div 
                      key={tx.id} 
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors group"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={cn(
                          "p-2 rounded-lg transition-colors shrink-0",
                          isDeposit ? "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100" :
                          isReward ? "bg-amber-50 text-amber-600 group-hover:bg-amber-100" :
                          isUsage ? "bg-blue-50 text-blue-600 group-hover:bg-blue-100" :
                          "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                        )}>
                          {getTransactionIcon(tx.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-900 text-sm flex items-center gap-2">
                            <span>
                              {getTransactionLabel(tx.type)}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 flex flex-col gap-0.5 mt-0.5">
                             <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(tx.created_at).toLocaleString()}
                             </div>
                             {tx.description && (
                               <span className="text-slate-500 font-normal break-words whitespace-pre-wrap block w-full text-[11px] leading-snug mt-1" title={tx.description}>
                                 {formatDescription(tx.description, tx.type)}
                                </span>
                             )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div className={cn(
                          "font-bold text-sm font-mono",
                          (isDeposit || isReward) ? "text-emerald-600" : "text-slate-900"
                        )}>
                          {(isDeposit || isReward) ? '+' : ''}{tx.amount}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          余额: {tx.balance_after}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-40 flex flex-col items-center justify-center text-slate-400">
                <History className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-sm">暂无交易记录</p>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
