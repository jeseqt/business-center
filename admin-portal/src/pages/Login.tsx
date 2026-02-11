import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/Card';
import { LayoutDashboard, Lock, Mail } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
    } catch (err: any) {
      setError('登录失败，请检查邮箱和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px]">
      <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="text-center flex flex-col items-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            APP业务中台管理系统
          </h2>
        </div>

        <Card className="shadow-2xl shadow-slate-200/50 border-slate-100 overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-brand-400 via-brand-600 to-brand-800"></div>
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-xl text-center font-bold">欢迎回来</CardTitle>
            <p className="text-center text-sm text-slate-500">请输入管理员账号进行登录</p>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Input
                  label="电子邮箱"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  className="h-11"
                  icon={<Mail className="h-4 w-4 text-slate-400" />}
                />
              </div>
              <div className="space-y-2">
                <Input
                  label="密码"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-11"
                  icon={<Lock className="h-4 w-4 text-slate-400" />}
                />
              </div>
              {error && (
                <div className="text-red-600 text-sm p-3 bg-red-50 rounded-lg border border-red-100 flex items-center gap-2 animate-in slide-in-from-top-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-red-600 shrink-0"></div>
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full h-11 text-base shadow-brand-500/25" size="lg" loading={loading}>
                {loading ? '登录中...' : '立即登录'}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        <p className="text-center text-xs text-slate-400">
          © 2026 朗伯余弦(北京)科技有限公司. All rights reserved.
        </p>
      </div>
    </div>
  );
}
