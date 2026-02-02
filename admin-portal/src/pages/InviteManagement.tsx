import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { Copy, Plus, RefreshCw, Calendar, Hash } from 'lucide-react';

interface InviteCode {
  id: string;
  code: string;
  app_id: string;
  valid_days: number;
  max_usage: number;
  used_count: number;
  expires_at: string;
  created_at: string;
}

export default function InviteManagement() {
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Generation State
  const [genAppId, setGenAppId] = useState('');
  const [genCount, setGenCount] = useState(1);
  const [genValidDays, setGenValidDays] = useState(30);
  const [genMaxUsage, setGenMaxUsage] = useState(1);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(`admin-invite-manage?page=${page}`, {
        method: 'GET'
      });
      if (error) throw error;
      setInvites(data.data || []);
    } catch (err) {
      console.error('Failed to load invites:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-invite-manage', {
        body: {
          app_id: genAppId,
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
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-4 rounded-lg border shadow-sm">
        <h2 className="text-lg font-medium text-gray-900">邀请码列表</h2>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          批量生成
        </Button>
      </div>

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b text-gray-500">
              <tr>
                <th className="px-6 py-4 font-medium">邀请码 (Code)</th>
                <th className="px-6 py-4 font-medium">应用 ID</th>
                <th className="px-6 py-4 font-medium">使用情况</th>
                <th className="px-6 py-4 font-medium">有效期</th>
                <th className="px-6 py-4 font-medium">状态</th>
                <th className="px-6 py-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
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
                      <code className="bg-gray-100 px-2 py-1 rounded text-indigo-600 font-mono font-bold border border-gray-200">
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
                  <td className="px-6 py-4 text-xs font-mono text-gray-500">
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
                  <td className="px-6 py-4">
                    <div className="flex flex-col text-xs text-gray-500">
                      <span>{invite.valid_days} 天有效</span>
                      <span className="text-[10px] text-gray-400">
                        过期: {invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : '永久'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(invite)}
                  </td>
                  <td className="px-6 py-4 text-right">
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

        <div className="border-t p-4 flex items-center justify-between bg-gray-50">
          <div className="text-xs text-gray-500">
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
      </div>

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
          <Input
            label="目标应用 ID (App ID)"
            value={genAppId}
            onChange={(e) => setGenAppId(e.target.value)}
            placeholder="请输入应用 UUID"
            icon={<Hash className="h-4 w-4" />}
          />
          
          <div className="grid grid-cols-2 gap-4">
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
