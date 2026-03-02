import * as Dialog from '@radix-ui/react-dialog';
import { X, History, Loader2, ArrowUpRight, ArrowDownLeft, Clock } from 'lucide-react';
import { Button } from './Button';
import { PlatformWalletTransaction } from '../types/shared';
import { cn } from '../lib/utils';

interface TransactionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: PlatformWalletTransaction[];
  loading: boolean;
}

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
                  const isUsage = tx.type === 'usage';
                  
                  return (
                    <div 
                      key={tx.id} 
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-lg transition-colors",
                          isDeposit ? "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100" :
                          isUsage ? "bg-blue-50 text-blue-600 group-hover:bg-blue-100" :
                          "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                        )}>
                          {isDeposit ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900 text-sm flex items-center gap-2">
                            <span>
                              {isDeposit ? '充值' : isUsage ? '消费' : tx.type}
                            </span>
                            {tx.description && (
                              <span className="text-xs text-slate-400 font-normal truncate max-w-[120px]">
                                {tx.description}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {new Date(tx.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={cn(
                          "font-bold text-sm font-mono",
                          tx.amount > 0 ? "text-emerald-600" : "text-slate-900"
                        )}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount}
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
