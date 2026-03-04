import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Copy, Plus, RefreshCw, Hash, Ticket } from 'lucide-react';

interface InviteCode {
  id: string;
  code: string;
  app_id: string;
  type: 'beta' | 'activity';
  valid_days: number;
  max_usage: number;
  used_count: number;
  expires_at: string;
  created_at: string;
}

interface App {
  id: string;
  name: string;
}

export default function InviteManagement() {
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [currentType, setCurrentType] = useState<'beta' | 'activity'>('beta');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Generation State
  const [genAppId, setGenAppId] = useState('');
  const [genType, setGenType] = useState<'beta' | 'activity'>('beta');
  const [genCount, setGenCount] = useState(1);
  const [genValidDays, setGenValidDays] = useState(30);
  const [genMaxUsage, setGenMaxUsage] = useState(1);

  useEffect(() => {
    fetchApps();
  }, []);

  const fetchApps = async () => {
    const { data } = await supabase.from('platform_apps').select('id, name').order('created_at', { ascending: false });
    if (data) setApps(data);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // const { data: { session } } = await supabase.auth.getSession();
      
      // 强制使用 error 打印，确保在控制台可见
      // console.error('=== DEBUG INFO ===');
      // console.error('Supabase URL:', supabase.supabaseUrl);
      // console.error('Token Prefix:', session?.access_token ? session.access_token.substring(0, 20) + '...' : 'NO TOKEN');
      // console.error('User ID:', session?.user?.id);
      
      // 原有调用
      // const { data, error } = await supabase.functions.invoke(`admin-invite-manage?page=${page}`, {
      //   method: 'GET'
      // });
      
      // Direct DB Query
      const from = (page - 1) * 20;
      const to = from + 19;
      
      let query = supabase
        .from('platform_invite_codes')
        .select('*');

      if (currentType === 'activity') {
        // 兼容旧数据：type 为 null 的也被视为 activity
        query = query.or('type.eq.activity,type.is.null');
      } else {
        query = query.eq('type', currentType);
      }
      
      const { data: resultData, error } = await query
        .range(from, to)
        .order('created_at', { ascending: false });

      if (error) {
        // 尝试解析错误详情
        // if (error instanceof  Error && 'context' in error) { ... }
        throw error;
      }
      setInvites(resultData || []);
      // setTotalCount(data.count || 0);
    } catch (err) {
      console.error('Failed to load invites:', err);
      // Auto logout on Invalid JWT or 401
      if (JSON.stringify(err).includes('Invalid JWT') || (err as any)?.status === 401) {
        console.error('Invalid Session detected. Token payload analysis:');
        try {
            const token = (await supabase.auth.getSession()).data.session?.access_token;
            if (token) {
                const parts = token.split('.');
                if (parts.length === 3) {
                    console.error('Header:', atob(parts[0]));
                    console.error('Payload:', atob(parts[1]));
                }
            }
        } catch (e) { console.error('Token analysis failed', e); }

        console.warn('Force clearing session and storage...');
        await supabase.auth.signOut();
        localStorage.clear(); // 强制清除所有本地存储
        sessionStorage.clear();
        window.location.href = '/login'; // 强制跳转
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, currentType]);

    const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-invite-manage', {
        body: {
          app_id: genAppId,
          type: genType,
          count: genCount,
          valid_days: genValidDays,
          max_usage: genMaxUsage
        }
      });
      if (error) throw error;
      setIsModalOpen(false);
      loadData();
      // Reset form defaults
      setGenCount(1);
    } catch (err) {
      alert('生成邀请码失败，请检查参数');
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // In a real app, we'd show a toast here
  };

  const getStatusBadge = (invite: InviteCode) => {
    const isExpired = invite.expires_at && new Date(invite.expires_at) < new Date();
    const isFullyUsed = invite.used_count >= invite.max_usage;

    if (isFullyUsed) return <Badge variant="secondary">已用完</Badge>;
    if (isExpired) return <Badge variant="destructive">已过期</Badge>;
    return <Badge variant="success">有效</Badge>;
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="邀请码管理" 
        description="生成和管理应用邀请码，控制用户注册权限"
        icon={Ticket}
        action={
          <Button onClick={() => { setGenType(currentType); setIsModalOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            批量生成
          </Button>
        }
      />

      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => { setCurrentType('beta'); setPage(1); }}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            currentType === 'beta' 
              ? 'bg-white text-gray-900 shadow-sm' 
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          内测码
        </button>
        <button
          onClick={() => { setCurrentType('activity'); setPage(1); }}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            currentType === 'activity' 
              ? 'bg-white text-gray-900 shadow-sm' 
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          邀请码
        </button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">邀请码 (Code)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">应用 ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">使用情况</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">有效期</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
                      <span>加载数据中...</span>
                    </div>
                  </td>
                </tr>
              ) : invites.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    暂无邀请码数据
                  </td>
                </tr>
              ) : invites.map((invite) => (
                <tr key={invite.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 group">
                      <code className="bg-gray-100 px-2 py-1 rounded text-indigo-600 font-mono font-bold border border-gray-200 text-sm">
                        {invite.code}
                      </code>
                      <button 
                        onClick={() => copyToClipboard(invite.code)}
                        className="text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="复制"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-mono text-gray-500 hidden md:table-cell">
                    {invite.app_id}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${invite.used_count >= invite.max_usage ? 'bg-red-500' : 'bg-green-500'}`} 
                          style={{ width: `${Math.min((invite.used_count / invite.max_usage) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600">
                        {invite.used_count}/{invite.max_usage}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
                    <div className="flex flex-col text-xs text-gray-500">
                      <span>{invite.valid_days} 天有效</span>
                      <span className="text-[10px] text-gray-400">
                        过期: {invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : '永久'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(invite)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => loadData()} // Just refresh for now
                      className="text-gray-400 hover:text-gray-900"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-500">
            显示第 {page} 页数据
          </div>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              disabled={page <= 1} 
              onClick={() => setPage(p => p - 1)}
            >
              上一页
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setPage(p => p + 1)}
              disabled={invites.length < 10}
            >
              下一页
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="批量生成邀请码"
        footer={
          <>
            <Button onClick={handleGenerate} loading={actionLoading}>
              确认生成
            </Button>
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={actionLoading}>
              取消
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium leading-none mb-2 text-gray-700">邀请码类型 (Type)</label>
            <div className="flex space-x-4 mb-1">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="genType" 
                  checked={genType === 'beta'} 
                  onChange={() => setGenType('beta')}
                  className="text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="text-sm text-gray-700">内测码</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="genType" 
                  checked={genType === 'activity'} 
                  onChange={() => setGenType('activity')}
                  className="text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="text-sm text-gray-700">邀请码</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium leading-none mb-1 text-gray-700">目标应用 (Target App)</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                <Hash className="h-4 w-4" />
              </div>
              <select
                value={genAppId}
                onChange={(e) => setGenAppId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 pl-9"
              >
                <option value="">请选择应用...</option>
                {apps.map(app => (
                  <option key={app.id} value={app.id}>{app.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="生成数量"
              type="number"
              min={1}
              max={100}
              value={genCount}
              onChange={(e) => setGenCount(parseInt(e.target.value) || 1)}
            />
            <Input
              label="有效期 (天)"
              type="number"
              min={1}
              value={genValidDays}
              onChange={(e) => setGenValidDays(parseInt(e.target.value) || 30)}
            />
          </div>

          <Input
            label="每个码最大使用次数"
            type="number"
            min={1}
            value={genMaxUsage}
            onChange={(e) => setGenMaxUsage(parseInt(e.target.value) || 1)}
            placeholder="默认为 1 次"
          />

          <div className="text-xs text-blue-600 bg-blue-50 p-3 rounded border border-blue-100">
            💡 生成后邀请码将立即生效。请确保 App ID 正确，否则该应用下的用户无法使用这些邀请码。
          </div>
        </div>
      </Modal>
    </div>
  );
}
