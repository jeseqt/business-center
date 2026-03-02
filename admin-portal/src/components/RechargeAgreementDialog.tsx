import * as Dialog from '@radix-ui/react-dialog';
import { X, ShieldCheck, ScrollText } from 'lucide-react';
import { Button } from './Button';

interface RechargeAgreementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RechargeAgreementDialog({ open, onOpenChange }: RechargeAgreementDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] border bg-white shadow-2xl duration-200 sm:rounded-2xl animate-in fade-in zoom-in-95 slide-in-from-left-1/2 slide-in-from-top-[48%] overflow-hidden flex flex-col max-h-[85vh]">
          
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <Dialog.Title className="text-lg font-bold text-slate-900">
                平台积分充值及使用协议
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </Button>
            </Dialog.Close>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 text-sm text-slate-600 leading-relaxed space-y-6">
            
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-amber-800 text-xs font-medium mb-4 flex gap-3">
              <ScrollText className="w-5 h-5 flex-shrink-0 text-amber-600" />
              <div>
                <p className="font-bold text-amber-900 mb-1">重要提示</p>
                <p>请您在充值前仔细阅读本协议，特别是关于“不可退款”、“仅限平台内使用”等条款。一旦您进行充值操作，即视为您已完全理解并同意本协议内容。</p>
              </div>
            </div>

            <section>
              <h3 className="text-slate-900 font-bold mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                1. 积分性质定义
              </h3>
              <p>
                “朗伯币”（以下简称“积分”）是本平台提供的用于兑换平台内增值服务（如AI模型调用、高级功能解锁等）的虚拟凭证。
                <strong>积分不具有货币属性，不是法定货币，不具备法偿性。</strong>
                积分仅限在本平台及关联应用内部流转使用，不具有任何投资、理财或升值属性。
              </p>
            </section>

            <section>
              <h3 className="text-slate-900 font-bold mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                2. 充值与获取
              </h3>
              <ul className="list-disc pl-5 space-y-1 marker:text-slate-400">
                <li>用户通过平台官方渠道（如支付宝、微信支付、信用卡等）支付法定货币购买积分。</li>
                <li>用户也可通过平台活动、签到、邀请好友等方式免费获取积分（此类称为“赠送积分”）。</li>
                <li>充值成功后，积分将即时发放至您的平台账户。因网络原因可能存在短暂延迟，请耐心等待或联系客服。</li>
              </ul>
            </section>

            <section>
              <h3 className="text-slate-900 font-bold mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                3. 使用规则（严禁违规交易）
              </h3>
              <p className="mb-2">根据中国法律法规及监管要求，本平台严厉打击任何形式的虚拟货币炒作与非法交易：</p>
              <ul className="list-disc pl-5 space-y-1 marker:text-rose-400">
                <li className="text-slate-700"><strong>严禁私下买卖：</strong> 用户不得在任何第三方平台（如闲鱼、淘宝、微信群等）交易、买卖、转让本平台积分。</li>
                <li className="text-slate-700"><strong>严禁兑换现金：</strong> 积分一经充值成功，<strong>除法律法规另有规定外，不支持任何形式的退款、提现或逆向兑换为法定货币。</strong></li>
                <li className="text-slate-700"><strong>仅限本人使用：</strong> 积分仅限当前账号使用，不同账号之间的积分不可转移、赠与或合并。</li>
              </ul>
            </section>

            <section>
              <h3 className="text-slate-900 font-bold mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                4. 有效期与服务终止
              </h3>
              <p>
                充值获取的积分通常长期有效，除非平台另有公告说明。
                若用户违反平台用户协议（如利用漏洞刷分、使用外挂等），平台有权冻结或扣除其账户内的积分，并终止提供服务，且不予退款。
              </p>
            </section>

            <section>
              <h3 className="text-slate-900 font-bold mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                5. 免责声明
              </h3>
              <p>
                平台不鼓励未成年人进行充值消费。如您是未成年人，请在监护人陪同下阅读本协议并进行操作。
                因用户保管不善导致账号被盗、积分丢失的，平台将协助调查，但不承担赔偿责任。
              </p>
            </section>

          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
            <Button onClick={() => onOpenChange(false)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              我已阅读并同意
            </Button>
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
