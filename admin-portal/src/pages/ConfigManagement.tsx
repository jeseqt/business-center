import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Plus, Edit2, Trash2, Settings, Send, Save, X } from 'lucide-react';

// --- Types ---

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

interface ModelPricing {
  input: number;
  output: number;
}

interface PointsPricingConfig {
  point_value_usd: number;
  markup_multiplier: number;
  rmb_to_usd: number;
  model_pricing_rmb: Record<string, ModelPricing>;
}

// --- Constants ---

const DEFAULT_POINTS_PRICING: PointsPricingConfig = {
  point_value_usd: 0.0074,
  markup_multiplier: 10,
  rmb_to_usd: 7.25,
  model_pricing_rmb: {
    "qwen-turbo": { "input": 0.0003, "output": 0.0006 },
    "qwen-plus": { "input": 0.0008, "output": 0.002 },
    "qwen-max": { "input": 0.004, "output": 0.012 },
    "text-embedding-v3": { "input": 0.0001, "output": 0 }
  }
};

const PREDEFINED_KEYS = [
  { key: 'points_pricing', label: '积分扣减规则 (Points Pricing)' },
  { key: 'custom', label: '自定义配置 (Custom)' }
];

// --- Sub-components ---

const PointsPricingEditor = ({ 
  value, 
  onChange 
}: { 
  value: string; 
  onChange: (newValue: string) => void;
}) => {
  const [config, setConfig] = useState<PointsPricingConfig>(() => {
    try {
      return value ? JSON.parse(value) : DEFAULT_POINTS_PRICING;
    } catch {
      return DEFAULT_POINTS_PRICING;
    }
  });

  // Convert map to array for easier editing
  const [models, setModels] = useState<{name: string, input: number, output: number}[]>(() => {
    return Object.entries(config.model_pricing_rmb || {}).map(([k, v]) => ({
      name: k,
      input: v.input,
      output: v.output
    }));
  });

  // Update parent whenever local state changes
  useEffect(() => {
    const newConfig = {
      ...config,
      model_pricing_rmb: models.reduce((acc, curr) => {
        if (curr.name) {
          acc[curr.name] = { input: curr.input, output: curr.output };
        }
        return acc;
      }, {} as Record<string, ModelPricing>)
    };
    onChange(JSON.stringify(newConfig, null, 2));
  }, [config.point_value_usd, config.markup_multiplier, config.rmb_to_usd, models]);

  const handleModelChange = (index: number, field: 'name' | 'input' | 'output', val: string | number) => {
    const newModels = [...models];
    // @ts-ignore
    newModels[index][field] = val;
    setModels(newModels);
  };

  const addModel = () => {
    setModels([...models, { name: '', input: 0, output: 0 }]);
  };

  const removeModel = (index: number) => {
    setModels(models.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">单积分价值 (USD)</label>
          <div className="relative rounded-md shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <span className="text-gray-500 sm:text-sm">$</span>
            </div>
            <input
              type="number"
              step="0.0001"
              className="block w-full rounded-md border-gray-300 pl-7 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
              value={config.point_value_usd}
              onChange={e => setConfig({...config, point_value_usd: parseFloat(e.target.value)})}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">例如: 0.0074 (1积分 ≈ $0.0074)</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">利润倍数 (Markup)</label>
          <input
            type="number"
            step="0.1"
            className="block w-full rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
            value={config.markup_multiplier}
            onChange={e => setConfig({...config, markup_multiplier: parseFloat(e.target.value)})}
          />
           <p className="mt-1 text-xs text-gray-500">基础成本 x 倍数 = 最终扣分</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">汇率 (RMB/USD)</label>
          <div className="relative rounded-md shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <span className="text-gray-500 sm:text-sm">¥</span>
            </div>
            <input
              type="number"
              step="0.01"
              className="block w-full rounded-md border-gray-300 pl-7 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
              value={config.rmb_to_usd}
              onChange={e => setConfig({...config, rmb_to_usd: parseFloat(e.target.value)})}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <div className="flex justify-between items-center mb-3">
          <label className="block text-sm font-medium text-gray-900">模型定价 (RMB / 1k Tokens)</label>
          <Button size="sm" onClick={addModel} type="button" className="gap-1">
            <Plus className="h-3 w-3" /> 添加模型
          </Button>
        </div>
        
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg bg-white">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <th className="py-2 pl-4 pr-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">模型标识 (Model Key)</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">输入价格 (Input)</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">输出价格 (Output)</th>
                <th className="relative py-2 pl-3 pr-4 sm:pr-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {models.map((model, idx) => (
                <tr key={idx}>
                  <td className="whitespace-nowrap py-2 pl-4 pr-3 text-sm">
                    <input 
                      type="text" 
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs border p-1"
                      placeholder="e.g. gpt-4"
                      value={model.name}
                      onChange={e => handleModelChange(idx, 'name', e.target.value)}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">
                    <input 
                      type="number" 
                      step="0.0001"
                      className="block w-24 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs border p-1"
                      value={model.input}
                      onChange={e => handleModelChange(idx, 'input', parseFloat(e.target.value))}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">
                    <input 
                      type="number" 
                      step="0.0001"
                      className="block w-24 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs border p-1"
                      value={model.output}
                      onChange={e => handleModelChange(idx, 'output', parseFloat(e.target.value))}
                    />
                  </td>
                  <td className="relative whitespace-nowrap py-2 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    <button
                      type="button"
                      onClick={() => removeModel(idx)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {models.length === 0 && (
            <div className="p-4 text-center text-sm text-gray-500">暂无模型定价，请添加</div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Main Component ---

export default function ConfigManagement() {
  const [apps, setApps] = useState<AppData[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  
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
  
  // UI State
  const [keySelection, setKeySelection] = useState('custom'); // 'points_pricing' | 'custom'
  const [pushOnSave, setPushOnSave] = useState(false);

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
    const { data } = await supabase
      .from('platform_app_configs')
      .select('*')
      .eq('app_id', appId)
      .order('config_key');
    
    if (data) setConfigs(data);
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

      if (pushOnSave) {
        try {
          const { data: pushData, error: pushError } = await supabase.functions.invoke('admin-push-config', {
            body: {
              app_id: selectedAppId,
              config_key: payload.config_key,
              config_value: payload.config_value
            }
          });
          
          if (pushError || (pushData && pushData.error)) {
             console.error('Push failed after save:', pushError || pushData.error);
             alert('配置保存成功，但自动推送失败。请手动尝试推送。');
          }
        } catch (pushErr) {
           console.error('Push exception:', pushErr);
           alert('配置保存成功，但自动推送异常。');
        }
      }

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

  const handlePush = async (config: ConfigItem) => {
    if (!confirm(`确认要将配置 "${config.config_key}" 推送到业务系统吗？`)) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('admin-push-config', {
        body: {
          app_id: config.app_id,
          config_key: config.config_key,
          config_value: config.config_value
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      alert('推送成功');
    } catch (err: any) {
      console.error('Push error:', err);
      alert('推送失败: ' + (err.message || '未知错误'));
    }
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
    setKeySelection('custom');
    setPushOnSave(false);
  };

  const handleKeySelectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selection = e.target.value;
    setKeySelection(selection);
    
    if (selection === 'points_pricing') {
      setFormData(prev => ({
        ...prev,
        config_key: 'points_pricing',
        // Auto-fill template if empty or if switching from custom
        config_value: prev.config_value || JSON.stringify(DEFAULT_POINTS_PRICING, null, 2)
      }));
      setPushOnSave(true);
    } else {
      setFormData(prev => ({
        ...prev,
        config_key: '',
        config_value: ''
      }));
      setPushOnSave(false);
    }
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (config: ConfigItem) => {
    setEditingConfig(config);
    
    // Determine key selection type
    const isPointsPricing = config.config_key === 'points_pricing';
    setKeySelection(isPointsPricing ? 'points_pricing' : 'custom');
    setPushOnSave(isPointsPricing);

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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Value</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Env</th>
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
                      <dl className="md:hidden mt-1 space-y-1">
                        <div className="flex justify-between gap-x-4 py-1">
                          <dt className="text-xs text-gray-500">Env</dt>
                          <dd className="text-xs text-gray-900">
                            <Badge variant={config.environment === 'production' ? 'success' : 'warning'}>
                              {config.environment}
                            </Badge>
                          </dd>
                        </div>
                      </dl>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <pre className="text-xs bg-gray-50 p-2 rounded border max-w-xs overflow-auto">
                        {typeof config.config_value === 'object' 
                          ? JSON.stringify(config.config_value, null, 1) 
                          : String(config.config_value)}
                      </pre>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
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
                        {config.config_key === 'points_pricing' && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handlePush(config)}
                            title="推送到业务系统"
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
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
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>取消</Button>
            <Button type="submit" form="config-form" className="gap-2">
              <Save className="h-4 w-4" /> 保存配置
            </Button>
          </div>
        }
      >
        <form id="config-form" onSubmit={handleSubmit} className="space-y-4">
          
          {/* Config Key Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700">配置键 (Key)</label>
            <div className="mt-1 flex gap-2">
              <select
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                value={keySelection}
                onChange={handleKeySelectionChange}
                disabled={!!editingConfig} // Immutable on edit
              >
                {PREDEFINED_KEYS.map(opt => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            </div>
            
            {keySelection === 'custom' && (
              <div className="mt-2">
                 <Input
                  value={formData.config_key}
                  onChange={(e) => setFormData({...formData, config_key: e.target.value})}
                  placeholder="输入自定义 Key (如: welcome_message)"
                  required
                  disabled={!!editingConfig}
                />
              </div>
            )}
            <p className="mt-1 text-xs text-gray-500">唯一标识符，创建后不可修改</p>
          </div>

          {/* Dynamic Config Value Editor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">配置内容</label>
            
            {keySelection === 'points_pricing' ? (
              <PointsPricingEditor 
                value={formData.config_value}
                onChange={(newValue) => setFormData({...formData, config_value: newValue})}
              />
            ) : (
              <textarea
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 h-32 font-mono"
                value={formData.config_value}
                onChange={(e) => setFormData({...formData, config_value: e.target.value})}
                placeholder='{"text": "你好", "color": "red"} 或 "true"'
                required
              />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <label className="block text-sm font-medium text-gray-700">状态 & 选项</label>
              <div className="mt-2 space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-600">启用配置</span>
                </div>
                {keySelection === 'points_pricing' && (
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={pushOnSave}
                      onChange={(e) => setPushOnSave(e.target.checked)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-600 font-medium text-blue-600">保存后自动推送到业务系统</span>
                  </div>
                )}
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
        </form>
      </Modal>
    </div>
  );
}
