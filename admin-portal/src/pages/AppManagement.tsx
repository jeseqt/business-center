import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Plus, Copy, RefreshCw, Layers } from 'lucide-react';

interface AppData {
  id: string;
  name: string;
  description: string;
  app_key: string;
  status: string;
  created_at: string;
}

export default function AppManagement() {
  const [apps, setApps] = useState<AppData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSecretModalOpen, setIsSecretModalOpen] = useState(false);
  
  // Create Form State
  const [appName, setAppName] = useState('');
  const [appDesc, setAppDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // New App Result
  const [newAppResult, setNewAppResult] = useState<{name: string, app_key: string, app_secret: string} | null>(null);

  const loadApps = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('platform_apps')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      if (data) setApps(data);
    } catch (err) {
      console.error('Load apps failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-app-manage', {
        body: { name: appName, description: appDesc },
        method: 'POST'
      });

      if (error) throw error;
      
      setNewAppResult(data.data);
      setIsCreateModalOpen(false);
      setIsSecretModalOpen(true);
      loadApps();
      setAppName('');
      setAppDesc('');
    } catch (err: any) {
      alert('创建应用失败: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Ideal: Show toast
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <PageHeader 
        title="应用接入管理" 
        description="管理接入中台的业务应用及密钥"
        icon={Layers}
        action={
          <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            接入新应用
          </Button>
        }
      />

      {/* App List */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">应用名称</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">应用 ID (Key)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">加载中...</td>
                </tr>
              ) : apps.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">暂无应用，请点击右上角创建</td>
                </tr>
              ) : (
                apps.map((app) => (
                  <tr key={app.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{app.name}</div>
                      <div className="text-xs text-gray-500">{app.description || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-gray-600">
                        {app.app_key}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={app.status === 'active' ? 'success' : 'secondary'}>
                          {app.status === 'active' ? '已启用' : '已停用'}
                        </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(app.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Button variant="ghost" size="sm" onClick={() => alert('重置密钥功能开发中')}>
                        <RefreshCw className="h-4 w-4 text-gray-400" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="接入新应用"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">应用名称</label>
            <Input 
                value={appName} 
                onChange={(e) => setAppName(e.target.value)} 
                placeholder="例如：商城小程序" 
                required 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述 (可选)</label>
            <Input 
                value={appDesc} 
                onChange={(e) => setAppDesc(e.target.value)} 
                placeholder="该应用的用途说明" 
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>取消</Button>
            <Button type="submit" disabled={creating}>
                {creating ? '创建中...' : '确认创建'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Secret Display Modal */}
      <Modal
        isOpen={isSecretModalOpen}
        onClose={() => setIsSecretModalOpen(false)}
        title="应用创建成功"
      >
        <div className="space-y-4">
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                <div className="flex">
                    <div className="ml-3">
                        <p className="text-sm text-yellow-700">
                            请立即保存您的 App Secret。出于安全考虑，它将<strong>不会再次显示</strong>。
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase">应用 ID (App ID)</label>
                    <div className="mt-1 flex rounded-md shadow-sm">
                        <code className="flex-1 block w-full rounded-none rounded-l-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-900">
                            {newAppResult?.app_key}
                        </code>
                        <button
                            type="button"
                            onClick={() => copyToClipboard(newAppResult?.app_key || '')}
                            className="relative -ml-px inline-flex items-center space-x-2 rounded-r-md border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                            <Copy className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase">应用密钥 (App Secret)</label>
                    <div className="mt-1 flex rounded-md shadow-sm">
                        <code className="flex-1 block w-full rounded-none rounded-l-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-mono text-green-700 break-all">
                            {newAppResult?.app_secret}
                        </code>
                        <button
                            type="button"
                            onClick={() => copyToClipboard(newAppResult?.app_secret || '')}
                            className="relative -ml-px inline-flex items-center space-x-2 rounded-r-md border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                            <Copy className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="pt-4 flex justify-end">
                <Button onClick={() => setIsSecretModalOpen(false)}>我已保存</Button>
            </div>
        </div>
      </Modal>
    </div>
  );
}
