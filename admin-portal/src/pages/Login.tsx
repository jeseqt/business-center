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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-indigo-600 rounded-lg flex items-center justify-center mb-4 shadow-lg shadow-indigo-200">
            <LayoutDashboard className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            朗伯余弦(北京)科技有限公司-APP业务中台管理系统
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            请使用管理员账号登录
          </p>
        </div>

        <Card className="border-t-4 border-t-indigo-600 shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl text-center">账号登录</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Input
                  label="电子邮箱"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  icon={<Mail className="h-4 w-4" />}
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
                  icon={<Lock className="h-4 w-4" />}
                />
              </div>
              {error && (
                <div className="text-red-600 text-sm p-3 bg-red-50 rounded-md border border-red-100 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-600"></span>
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" size="lg" loading={loading}>
                {loading ? '登录中...' : '登 录'}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        <p className="text-center text-xs text-gray-500">
          © 2026 朗伯余弦(北京)科技有限公司. All rights reserved.
        </p>
      </div>
    </div>
  );
}
