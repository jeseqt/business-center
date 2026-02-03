import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Settings, Plus, Edit2, Trash2, Power, Search, Save, X } from 'lucide-react';

interface AppData {
  id: string;
  name: string;
}

interface ConfigItem {
  id: string;
  app_id: string;
  config_key: string;
  config_value: any;
  environment: string;
  description: string;
  is_active: boolean;
  updated_at: string;
}

export default function ConfigManagement() {
  const [apps, setApps] = useState<AppData[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Create/Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ConfigItem | null>(null);
  const [formData, setFormData] = useState({
    config_key: '',
    config_value: '',
    environment: 'production',
    description: '',
    is_active: true
  });

  useEffect(() => {
    loadApps();
  }, []);

  useEffect(() => {
    if (selectedAppId) {
      loadConfigs(selectedAppId);
    } else {
      setConfigs([]);
    }
  }, [selectedAppId]);

  const loadApps = async () => {
    const { data } = await supabase.from('platform_apps').select('id, name').order('name');
    if (data) {
      setApps(data);
      if (data.length > 0) setSelectedAppId(data[0].id);
    }
  };

  const loadConfigs = async (appId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from('platform_app_configs')
      .select('*')
      .eq('app_id', appId)
      .order('config_key');
    
    if (data) setConfigs(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppId) return;

    try {
      // Validate JSON
      let parsedValue;
      try {
        parsedValue = JSON.parse(formData.config_value);
      } catch (err) {
        // If simple string, wrap it? Or just error? 
        // For flexibility, let's treat non-JSON string as string value
        parsedValue = formData.config_value;
      }

      const payload = {
        app_id: selectedAppId,
        config_key: formData.config_key,
        config_value: parsedValue,
        environment: formData.environment,
        description: formData.description,
        is_active: formData.is_active
      };

      let error;
      if (editingConfig) {
        const { error: updateError } = await supabase
          .from('platform_app_configs')
          .update(payload)
          .eq('id', editingConfig.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('platform_app_configs')
          .insert(payload);
        error = insertError;
      }

      if (error) throw error;

      setIsModalOpen(false);
      loadConfigs(selectedAppId);
      resetForm();
    } catch (err: any) {
      alert('操作失败: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除此配置项吗？')) return;
    const { error } = await supabase.from('platform_app_configs').delete().eq('id', id);
    if (!error) loadConfigs(selectedAppId);
  };

  const toggleStatus = async (config: ConfigItem) => {
    const { error } = await supabase
      .from('platform_app_configs')
      .update({ is_active: !config.is_active })
      .eq('id', config.id);
    if (!error) loadConfigs(selectedAppId);
  };

  const resetForm = () => {
    setEditingConfig(null);
    setFormData({
      config_key: '',
      config_value: '',
      environment: 'production',
      description: '',
      is_active: true
    });
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (config: ConfigItem) => {
    setEditingConfig(config);
    setFormData({
      config_key: config.config_key,
      config_value: JSON.stringify(config.config_value, null, 2),
      environment: config.environment,
      description: config.description || '',
      is_active: config.is_active
    });
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader 
        title="统一配置中心" 
        description="动态管理 App 的功能开关与参数配置"
        icon={Settings}
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
              添加配置
            </Button>
          </div>
        }
      />

      {/* Config List */}
      <Card className="overflow-hidden">
        {configs.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {selectedAppId ? '该应用暂无配置项' : '请先选择一个应用'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Key</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Env</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {configs.map((config) => (
                  <tr key={config.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{config.config_key}</div>
                      <div className="text-xs text-gray-500">{config.description}</div>
                    </td>
                    <td className="px-6 py-4">
                      <pre className="text-xs bg-gray-50 p-2 rounded border max-w-xs overflow-auto">
                        {typeof config.config_value === 'object' 
                          ? JSON.stringify(config.config_value, null, 1) 
                          : String(config.config_value)}
                      </pre>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={config.environment === 'production' ? 'success' : 'warning'}>
                        {config.environment}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button 
                        onClick={() => toggleStatus(config)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          config.is_active ? 'bg-indigo-600' : 'bg-gray-200'
                        }`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          config.is_active ? 'translate-x-5' : 'translate-x-0'
                        }`} />
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEditModal(config)}>
                          <Edit2 className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(config.id)}>
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
        title={editingConfig ? "编辑配置" : "新建配置"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">配置键 (Key)</label>
            <Input
              value={formData.config_key}
              onChange={(e) => setFormData({...formData, config_key: e.target.value})}
              placeholder="例如：welcome_message"
              required
              disabled={!!editingConfig} // Key is immutable for simplicity
            />
            <p className="mt-1 text-xs text-gray-500">唯一标识符，创建后不可修改</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">配置值 (支持 JSON)</label>
            <textarea
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 h-32 font-mono"
              value={formData.config_value}
              onChange={(e) => setFormData({...formData, config_value: e.target.value})}
              placeholder='{"text": "你好", "color": "red"} 或 "true"'
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">适用环境</label>
              <select
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                value={formData.environment}
                onChange={(e) => setFormData({...formData, environment: e.target.value})}
              >
                <option value="production">生产环境 (Production)</option>
                <option value="development">开发环境 (Development)</option>
                <option value="staging">预发布 (Staging)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">状态</label>
              <div className="mt-2 flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-600">启用</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">描述</label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="用途说明"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>取消</Button>
            <Button type="submit">保存配置</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
