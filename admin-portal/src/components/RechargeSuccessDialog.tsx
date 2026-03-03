import * as Dialog from '@radix-ui/react-dialog';
import { CheckCircle, X, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from './Button';
import { useState, useEffect } from 'react';

interface RechargeSuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RechargeSuccessDialog({ open, onOpenChange }: RechargeSuccessDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-300" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] bg-white p-0 shadow-2xl duration-300 sm:rounded-2xl animate-in fade-in zoom-in-95 slide-in-from-left-1/2 slide-in-from-top-[48%] overflow-hidden border border-white/20 outline-none">
                  {/* Header Background */}
                  <div className="bg-gradient-to-br from-emerald-400 to-teal-600 h-32 relative overflow-hidden flex items-center justify-center">
                     <div className="absolute inset-0 opacity-20 mix-blend-overlay bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
                     <div className="w-20 h-20 bg-white/20 rounded-full blur-xl absolute top-[-20%] right-[-10%]"></div>
                     <div className="w-32 h-32 bg-emerald-300/30 rounded-full blur-2xl absolute bottom-[-40%] left-[-20%]"></div>
                     <div className="relative z-10 bg-white rounded-full p-3 shadow-lg scale-125 animate-in zoom-in duration-500">
                        <CheckCircle className="w-12 h-12 text-emerald-500 fill-emerald-50" />
                     </div>
                  </div>

          <div className="p-8 text-center space-y-4">
            <Dialog.Title className="text-2xl font-bold text-slate-900">
              充值成功！
            </Dialog.Title>
            
            <Dialog.Description className="text-slate-500 text-sm">
              您的账户已成功充值，朗伯币已到账。感谢您的支持！
            </Dialog.Description>

            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center justify-center gap-3 my-6">
                <Sparkles className="w-5 h-5 text-emerald-500 animate-pulse" />
                <span className="text-emerald-700 font-bold text-lg">支付完成</span>
            </div>

            <div className="flex justify-center pt-2">
              <Button 
                onClick={() => onOpenChange(false)}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-6 shadow-lg shadow-slate-200/50 transition-all hover:scale-[1.02] flex items-center justify-center"
              >
                开始使用
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>

          <Dialog.Close asChild>
            <button className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/10 hover:bg-black/20 rounded-full p-1 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
