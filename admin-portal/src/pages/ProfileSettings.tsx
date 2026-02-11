import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/Card';
import { User, Mail, Lock, Shield } from 'lucide-react';

export default function ProfileSettings() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    getUser();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">加载用户信息中...</div>;
  }

  if (!user) {
    return <div className="p-8 text-center text-red-500">无法获取用户信息</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-brand-600" />
            基本信息
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">用户 ID</label>
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-600 font-mono text-sm">
                <Shield className="h-4 w-4 text-slate-400" />
                {user.id}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">电子邮箱</label>
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-600 font-mono text-sm">
                <Mail className="h-4 w-4 text-slate-400" />
                {user.email}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">注册时间</label>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-600 text-sm">
                {new Date(user.created_at).toLocaleString('zh-CN')}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">最后登录</label>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-600 text-sm">
                {new Date(user.last_sign_in_at || user.created_at).toLocaleString('zh-CN')}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-brand-600" />
            安全设置
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <h4 className="font-medium text-slate-900">登录密码</h4>
                <p className="text-sm text-slate-500">定期修改密码可以提高账号安全性</p>
              </div>
              <Button variant="outline">修改密码</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
