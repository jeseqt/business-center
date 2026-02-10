import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { GitBranch, Plus, Edit2, Trash2, Smartphone, Monitor, Globe } from 'lucide-react';

interface AppData {
  id: string;
  name: string;
}

interface VersionItem {
  id: string;
  app_id: string;
  platform: 'ios' | 'android' | 'web' | 'macos' | 'windows';
  version_name: string;
  version_code: number;
  update_content: string;
  download_url: string;
  is_force_update: boolean;
  status: 'active' | 'archived' | 'draft';
  created_at: string;
}

const PlatformIcon = ({ platform }: { platform: string }) => {
  switch (platform) {
    case 'ios':
    case 'android': return <Smartphone className="h-4 w-4" />;
    case 'web': return <Globe className="h-4 w-4" />;
    default: return <Monitor className="h-4 w-4" />;
  }
};

export default function VersionManagement() {
  const [apps, setApps] = useState<AppData[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Create/Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<VersionItem | null>(null);
  const [formData, setFormData] = useState({
    platform: 'ios',
    version_name: '',
    version_code: '',
    update_content: '',
    download_url: '',
    is_force_update: false,
    status: 'active'
  });

  useEffect(() => {
    loadApps();
  }, []);

  useEffect(() => {
    if (selectedAppId) {
      loadVersions(selectedAppId);
    } else {
      setVersions([]);
    }
  }, [selectedAppId]);

  const loadApps = async () => {
    const { data } = await supabase.from('platform_apps').select('id, name').order('name');
    if (data) {
      setApps(data);
      if (data.length > 0) setSelectedAppId(data[0].id);
    }
  };

  const loadVersions = async (appId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from('platform_app_versions')
      .select('*')
      .eq('app_id', appId)
      .order('version_code', { ascending: false });
    
    if (data) setVersions(data as any);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppId) return;

    try {
      const payload = {
        app_id: selectedAppId,
        platform: formData.platform,
        version_name: formData.version_name,
        version_code: parseInt(formData.version_code),
        update_content: formData.update_content,
        download_url: formData.download_url,
        is_force_update: formData.is_force_update,
        status: formData.status
      };

      let error;
      if (editingVersion) {
        const { error: updateError } = await supabase
          .from('platform_app_versions')
          .update(payload)
          .eq('id', editingVersion.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('platform_app_versions')
          .insert(payload);
        error = insertError;
      }

      if (error) throw error;

      setIsModalOpen(false);
      loadVersions(selectedAppId);
      resetForm();
    } catch (err: any) {
      alert('操作失败: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除此版本吗？')) return;
    const { error } = await supabase.from('platform_app_versions').delete().eq('id', id);
    if (!error) loadVersions(selectedAppId);
  };

  const resetForm = () => {
    setEditingVersion(null);
    setFormData({
      platform: 'ios',
      version_name: '',
      version_code: '',
      update_content: '',
      download_url: '',
      is_force_update: false,
      status: 'active'
    });
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (version: VersionItem) => {
    setEditingVersion(version);
    setFormData({
      platform: version.platform,
      version_name: version.version_name,
      version_code: String(version.version_code),
      update_content: version.update_content || '',
      download_url: version.download_url || '',
      is_force_update: version.is_force_update,
      status: version.status
    });
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader 
        title="版本发布管理" 
        description="发布新版本，管理强制更新策略"
        icon={GitBranch}
        action={
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select 
              value={selectedAppId}
              onChange={(e) => setSelectedAppId(e.target.value)}
              className="block w-full sm:w-48 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
            >
              {apps.map(app => (
                <option key={app.id} value={app.id}>{app.name}</option>
              ))}
            </select>
            <Button onClick={openCreateModal} disabled={!selectedAppId} className="gap-2 whitespace-nowrap">
              <Plus className="h-4 w-4" />
              发布新版本
            </Button>
          </div>
        }
      />

      {/* Version List */}
      <Card className="overflow-hidden">
        {versions.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {selectedAppId ? '暂无发布记录' : '请先选择一个应用'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">版本</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">平台</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">更新内容</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">强制更新</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">状态</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {versions.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-gray-900">{v.version_name}</span>
                        <span className="ml-2 text-xs text-gray-500">({v.version_code})</span>
                      </div>
                      <dl className="sm:hidden mt-1 space-y-1">
                         <div className="flex justify-between gap-x-4 py-1">
                           <dt className="text-xs text-gray-500">状态</dt>
                           <dd className="text-xs text-gray-900">
                            <Badge variant={v.status === 'active' ? 'success' : v.status === 'draft' ? 'warning' : 'default'}>
                                {v.status === 'active' ? '已发布' : v.status === 'draft' ? '草稿' : '已归档'}
                            </Badge>
                           </dd>
                         </div>
                      </dl>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-700 uppercase">
                        <PlatformIcon platform={v.platform} />
                        {v.platform}
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <div className="text-sm text-gray-500 truncate max-w-xs" title={v.update_content}>
                        {v.update_content || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                       {v.is_force_update ? (
                         <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">强制</span>
                       ) : (
                         <span className="text-xs text-gray-400">可选</span>
                       )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                      <Badge variant={v.status === 'active' ? 'success' : v.status === 'draft' ? 'warning' : 'default'}>
                        {v.status === 'active' ? '已发布' : v.status === 'draft' ? '草稿' : '已归档'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEditModal(v)}>
                          <Edit2 className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(v.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingVersion ? "编辑版本" : "发布新版本"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">适用平台</label>
              <select
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                value={formData.platform}
                onChange={(e) => setFormData({...formData, platform: e.target.value})}
              >
                <option value="ios">iOS</option>
                <option value="android">Android</option>
                <option value="web">Web</option>
                <option value="macos">macOS</option>
                <option value="windows">Windows</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">状态</label>
              <select
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value as any})}
              >
                <option value="active">已发布</option>
                <option value="draft">草稿</option>
                <option value="archived">已归档</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div>
              <label className="block text-sm font-medium text-gray-700">版本号名称</label>
              <Input
                value={formData.version_name}
                onChange={(e) => setFormData({...formData, version_name: e.target.value})}
                placeholder="例如：1.0.0"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">版本号代码 (整数)</label>
              <Input
                type="number"
                value={formData.version_code}
                onChange={(e) => setFormData({...formData, version_code: e.target.value})}
                placeholder="例如：100"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">更新内容</label>
            <textarea
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 h-24"
              value={formData.update_content}
              onChange={(e) => setFormData({...formData, update_content: e.target.value})}
              placeholder="请输入更新内容，如新功能、Bug 修复等..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">下载链接</label>
            <Input
              value={formData.download_url}
              onChange={(e) => setFormData({...formData, download_url: e.target.value})}
              placeholder="https://..."
            />
          </div>

          <div>
             <div className="flex items-center">
                <input
                  type="checkbox"
                  id="force_update"
                  checked={formData.is_force_update}
                  onChange={(e) => setFormData({...formData, is_force_update: e.target.checked})}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label htmlFor="force_update" className="ml-2 block text-sm text-gray-900 font-medium">
                  强制更新
                </label>
              </div>
              <p className="mt-1 text-xs text-red-500 ml-6">用户必须更新后才能继续使用 App</p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>取消</Button>
            <Button type="submit">发布版本</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
