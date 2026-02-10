import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Plus, Edit2, Trash2, Check, X, Bell } from 'lucide-react';

interface App {
  id: string;
  name: string;
}

interface Notification {
  id: string;
  app_id: string;
  title: string;
  content: string;
  type: 'announcement' | 'maintenance' | 'promotion';
  priority: 'high' | 'normal' | 'low';
  start_time: string;
  end_time: string | null;
  is_active: boolean;
  created_at: string;
}

export default function NotificationManagement() {
  const [apps, setApps] = useState<App[]>([]);
  const [selectedApp, setSelectedApp] = useState<string>('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNotification, setEditingNotification] = useState<Notification | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'announcement',
    priority: 'normal',
    start_time: '',
    end_time: '',
    is_active: true
  });

  useEffect(() => {
    fetchApps();
  }, []);

  useEffect(() => {
    if (selectedApp) {
      fetchNotifications();
    } else {
      setNotifications([]);
    }
  }, [selectedApp]);

  const fetchApps = async () => {
    const { data } = await supabase.from('platform_apps').select('id, name').order('created_at');
    if (data) {
      setApps(data);
      if (data.length > 0) setSelectedApp(data[0].id);
    }
  };

  const fetchNotifications = async () => {
    if (!selectedApp) return;
    setLoading(true);
    const { data } = await supabase
      .from('platform_app_notifications')
      .select('*')
      .eq('app_id', selectedApp)
      .order('created_at', { ascending: false });
    
    if (data) setNotifications(data);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!selectedApp) return;

    const payload = {
      app_id: selectedApp,
      title: formData.title,
      content: formData.content,
      type: formData.type,
      priority: formData.priority,
      start_time: formData.start_time || new Date().toISOString(),
      end_time: formData.end_time || null,
      is_active: formData.is_active
    };

    if (editingNotification) {
      const { error } = await supabase
        .from('platform_app_notifications')
        .update(payload)
        .eq('id', editingNotification.id);
      if (error) alert('更新失败: ' + error.message);
    } else {
      const { error } = await supabase
        .from('platform_app_notifications')
        .insert([payload]);
      if (error) alert('创建失败: ' + error.message);
    }

    setIsModalOpen(false);
    fetchNotifications();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此通知吗？')) return;
    const { error } = await supabase.from('platform_app_notifications').delete().eq('id', id);
    if (error) alert('删除失败');
    else fetchNotifications();
  };

  const openCreateModal = () => {
    setEditingNotification(null);
    setFormData({
      title: '',
      content: '',
      type: 'announcement',
      priority: 'normal',
      start_time: new Date().toISOString().slice(0, 16),
      end_time: '',
      is_active: true
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: Notification) => {
    setEditingNotification(item);
    setFormData({
      title: item.title,
      content: item.content,
      type: item.type,
      priority: item.priority,
      start_time: item.start_time ? new Date(item.start_time).toISOString().slice(0, 16) : '',
      end_time: item.end_time ? new Date(item.end_time).toISOString().slice(0, 16) : '',
      is_active: item.is_active
    });
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="通知中心 (Notification Center)" 
        description="管理和发布应用通知、公告及维护信息"
        icon={Bell}
        action={
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select 
              value={selectedApp}
              onChange={(e) => setSelectedApp(e.target.value)}
              className="block w-full sm:w-48 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
            >
              {apps.map(app => (
                <option key={app.id} value={app.id}>{app.name}</option>
              ))}
            </select>
            <Button onClick={openCreateModal} className="gap-2 whitespace-nowrap">
              <Plus className="h-4 w-4" />
              发布通知
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="text-center py-10 text-gray-500">加载中...</div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">标题</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">优先级</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">生效时间</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {notifications.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{item.title}</div>
                      <div className="text-sm text-gray-500 truncate max-w-xs">{item.content}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={
                        item.type === 'announcement' ? 'info' : 
                        item.type === 'maintenance' ? 'warning' : 'success'
                      }>
                        {item.type}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell">
                      <Badge variant={
                        item.priority === 'high' ? 'error' : 
                        item.priority === 'low' ? 'default' : 'success'
                      }>
                        {item.priority}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell">
                      {new Date(item.start_time).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={item.is_active ? 'success' : 'default'}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditModal(item)} className="text-indigo-600 hover:text-indigo-900">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-900">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingNotification ? '编辑通知' : '发布通知'}
        footer={
          <>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>取消</Button>
            <Button onClick={handleSave} disabled={!formData.title || !formData.content}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              placeholder="请输入通知标题"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({...formData, content: e.target.value})}
              className="w-full border rounded-md px-3 py-2 h-24 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="请输入通知详情..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">类型</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value as any})}
                className="w-full border rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value="announcement">公告</option>
                <option value="maintenance">维护</option>
                <option value="promotion">活动</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({...formData, priority: e.target.value as any})}
                className="w-full border rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value="normal">普通</option>
                <option value="high">高</option>
                <option value="low">低</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">开始时间</label>
              <Input
                type="datetime-local"
                value={formData.start_time}
                onChange={(e) => setFormData({...formData, start_time: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">结束时间 (选填)</label>
              <Input
                type="datetime-local"
                value={formData.end_time}
                onChange={(e) => setFormData({...formData, end_time: e.target.value})}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.is_active}
              onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
              className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-gray-300"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-gray-700">启用状态</label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
