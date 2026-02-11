import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Search, Wallet, Coins, Calendar, User as UserIcon, Clock, Lock, Unlock, Trash2, Eye } from 'lucide-react';

interface User {
  id: string;
  app_id: string;
  external_user_id: string;
  account?: string;
  email?: string;
  status: 'active' | 'blocked';
  platform_apps: { name: string };
  platform_wallets: {
    id: string;
    balance_permanent: number;
    balance_temporary: number;
  } | null;
  metadata: any;
  created_at: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [apps, setApps] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [emailFilter, setEmailFilter] = useState('');
  const [selectedAppId, setSelectedAppId] = useState('');
  
  // Wallet Adjustment State
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Create User State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    app_id: '',
    account: '',
    email: '',
    password: ''
  });

  // Lock User State
  const [isLockConfirmOpen, setIsLockConfirmOpen] = useState(false);
  const [userToLock, setUserToLock] = useState<User | null>(null);

  // Delete User State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');

  const loadApps = async () => {
    try {
      const { data, error } = await supabase
        .from('platform_apps')
        .select('id, name')
        .order('name');
      if (error) throw error;
      setApps(data || []);
    } catch (err) {
      console.error('Failed to load apps:', err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.warn('No active session found or session error. Redirecting to login.');
        await supabase.auth.signOut();
        // window.location.href = '/'; // Let the router handle auth guard
        return;
      }

      // Verify token validity with a lightweight auth check
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.warn('Current session token is invalid (likely from previous project). Signing out...');
        await supabase.auth.signOut();
        window.location.reload(); // Force reload to clear any stale state
        return;
      }

      // console.error('=== DEBUG INFO (UserManagement) ===');
      // console.error('Supabase URL:', supabase.supabaseUrl);
      // console.error('User ID:', user.id);
      // console.error('Token Valid:', !!session.access_token);

      const params = new URLSearchParams({ page: page.toString() });
      if (emailFilter) params.append('keyword', emailFilter);
      if (selectedAppId) params.append('app_id', selectedAppId);
      
      // Workaround for Supabase Gateway 401 Invalid JWT error:
      // Pass the user token in a custom header (x-user-token)
      // and reset Authorization to the Anon Key (which is always valid for the Gateway).
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const { data, error } = await supabase.functions.invoke(`admin-user-list?${params.toString()}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${anonKey}`,
            'x-user-token': session.access_token
        }
      });
      
      if (error) {
        if (error instanceof Error && 'context' in error) {
          const res = (error as any).context as Response;
          if (res && res.json) {
            try {
                const body = await res.json();
                console.error('Edge Function Error Body:', body);

                // Handle 401 Invalid JWT gracefully
                if (body?.code === 401 || body?.message === 'Invalid JWT') {
                    console.error('Critical Auth Error detected in response body.');
                    alert('您的登录会话已过期或无效，请重新登录。');
                    await supabase.auth.signOut();
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.href = '/login';
                    return; 
                }
            } catch (e) {
                console.error('Error parsing error body:', e);
            }
          }
        }
        throw error;
      }
      setUsers(data.data || []);
      setTotal(data.count || 0);
    } catch (err) {
      console.error('Failed to load users:', err);
      // Auto logout on Invalid JWT or 401
      if (JSON.stringify(err).includes('Invalid JWT') || (err as any)?.status === 401) {
        console.error('Invalid Session detected.');
        alert('您的登录会话已过期，请重新登录。');
        await supabase.auth.signOut();
        localStorage.clear(); 
        sessionStorage.clear();
        window.location.href = '/login'; 
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, []);

  useEffect(() => {
    loadData();
  }, [page, selectedAppId]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-user-create', {
        body: newUser
      });

      if (error) throw error;
      
      setIsCreateModalOpen(false);
      setNewUser({
        app_id: '',
        account: '',
        email: '',
        password: ''
      });
      loadData(); // Refresh list
      alert('用户创建成功');
    } catch (err) {
      console.error('Failed to create user:', err);
      alert('创建用户失败，请重试');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAdjustWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    
    const walletId = selectedUser.platform_wallets?.id;
    if (!walletId) {
      alert('该用户暂无钱包');
      return;
    }

    setActionLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('admin-wallet-manage', {
        body: {
          wallet_id: walletId,
          amount: adjustAmount,
          description: adjustReason
        }
      });

      if (error) throw error;
      setIsModalOpen(false);
      loadData(); // Refresh
      setAdjustAmount(0);
      setAdjustReason('');
    } catch (err) {
      alert('调整钱包余额失败');
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const openAdjustModal = (user: User) => {
    setSelectedUser(user);
    setAdjustAmount(0);
    setAdjustReason('');
    setIsModalOpen(true);
  };

  const openDetailModal = (user: User) => {
    setSelectedUser(user);
    setIsDetailModalOpen(true);
  };

  const handleToggleLock = (user: User) => {
    setUserToLock(user);
    setIsLockConfirmOpen(true);
  };

  const confirmToggleLock = async () => {
    if (!userToLock) return;
    const user = userToLock;
    const action = 'toggle_lock';

    setActionLoading(true);
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        const { error } = await supabase.functions.invoke('admin-user-action', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${anonKey}`,
                'x-user-token': session?.access_token || ''
            },
            body: { user_id: user.id, action }
        });

        if (error) throw error;
        
        // Optimistic update locally to avoid page refresh/loading spinner
        setUsers(users.map(u => 
          u.id === user.id 
            ? { ...u, status: u.status === 'blocked' ? 'active' : 'blocked' } 
            : u
        ));
        
        setIsLockConfirmOpen(false);
        setUserToLock(null);
    } catch (err) {
        console.error('Action failed:', err);
        alert('操作失败，请重试');
    } finally {
        setActionLoading(false);
    }
  };

  const handleDeleteUser = (user: User) => {
    setUserToDelete(user);
    setDeleteConfirmationInput('');
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteUser = async () => {
      if (!userToDelete) return;
      if (deleteConfirmationInput !== 'DELETE') return;

      const user = userToDelete;
      setActionLoading(true);
      try {
          const { data: { session } } = await supabase.auth.getSession();
          const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

          const { error } = await supabase.functions.invoke('admin-user-action', {
              method: 'POST',
              headers: {
                  Authorization: `Bearer ${anonKey}`,
                  'x-user-token': session?.access_token || ''
              },
              body: { user_id: user.id, action: 'delete' }
          });

          if (error) throw error;

          // Remove user locally
          setUsers(users.filter(u => u.id !== user.id));
          
          setIsDeleteModalOpen(false);
          setUserToDelete(null);
      } catch (err) {
          console.error('Delete failed:', err);
          alert('删除失败，请重试');
      } finally {
          setActionLoading(false);
      }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="用户与钱包管理" 
        description="查看应用用户、管理钱包余额及交易"
        icon={UserIcon}
        action={
          <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
            <UserIcon className="h-4 w-4 mr-2" />
            新建用户
          </Button>
        }
      />

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto flex-1">
            <div className="relative w-full sm:w-64">
              <select
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white appearance-none"
                value={selectedAppId}
                onChange={(e) => {
                  setSelectedAppId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">所有应用</option>
                {apps.map(app => (
                  <option key={app.id} value={app.id}>{app.name}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
            
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
              <input
                type="text"
                placeholder="按邮箱搜索用户..."
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 placeholder:text-slate-400"
                value={emailFilter}
                onChange={(e) => setEmailFilter(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
              />
            </div>

            <Button onClick={() => setPage(1)} variant="secondary" className="w-full sm:w-auto">
              搜索
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户 ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">账号</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">邮箱</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">所属应用</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">余额 (永久/临时)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">注册时间</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                    加载中...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                    暂无用户
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.external_user_id.slice(0, 8)}...
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.account ? <span className="font-medium text-gray-900">{user.account}</span> : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.email ? <span>{user.email}</span> : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden md:table-cell">
                      {user.platform_apps?.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        {user.platform_wallets ? (
                          <>
                            <div className="flex items-center text-sm font-medium text-gray-900">
                              <Coins className="h-4 w-4 text-yellow-500 mr-1" />
                              {user.platform_wallets.balance_permanent} (永久)
                            </div>
                            {user.platform_wallets.balance_temporary > 0 && (
                              <div className="flex items-center text-xs text-gray-500">
                                <Clock className="h-3 w-3 mr-1" />
                                +{user.platform_wallets.balance_temporary} (临时)
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-sm text-gray-400">无钱包</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                      <div className="flex items-center text-sm text-gray-500">
                        <Calendar className="h-4 w-4 mr-1 text-gray-400" />
                        {new Date(user.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                         <Button 
                           variant="ghost" 
                           size="sm" 
                           onClick={() => openDetailModal(user)} 
                           title="查看详情"
                         >
                           <Eye className="h-4 w-4 text-gray-600" />
                         </Button>

                         {user.platform_wallets && (
                           <Button 
                             variant="ghost" 
                             size="sm" 
                             onClick={() => openAdjustModal(user)} 
                             title="管理钱包"
                           >
                             <Wallet className="h-4 w-4 text-indigo-600" />
                           </Button>
                         )}

                         <Button 
                           variant="ghost" 
                           size="sm" 
                           onClick={() => handleToggleLock(user)}
                           title={user.status === 'blocked' ? "解锁用户" : "锁定用户"}
                         >
                           {user.status === 'blocked' ? (
                             <Unlock className="h-4 w-4 text-green-600" />
                           ) : (
                             <Lock className="h-4 w-4 text-orange-600" />
                           )}
                         </Button>

                         <Button 
                           variant="ghost" 
                           size="sm" 
                           onClick={() => handleDeleteUser(user)}
                           title="删除用户"
                         >
                           <Trash2 className="h-4 w-4 text-red-600" />
                         </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-500 flex items-center gap-4">
            <span>共 {total} 条</span>
            <span>第 {page} / {Math.ceil(total / pageSize) || 1} 页</span>
          </div>
          <div className="flex gap-2 items-center w-full sm:w-auto justify-center sm:justify-end">
            <div className="flex items-center gap-2 mr-2">
                <span className="text-sm text-gray-500 hidden sm:inline">跳转至</span>
                <input 
                    type="number" 
                    min={1} 
                    max={Math.ceil(total / pageSize) || 1}
                    className="w-16 px-2 py-1 text-sm border rounded-md text-center"
                    placeholder="页码"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            const val = parseInt((e.target as HTMLInputElement).value);
                            const maxPage = Math.ceil(total / pageSize) || 1;
                            if (!isNaN(val)) {
                                if (val > 0 && val <= maxPage) {
                                    setPage(val);
                                } else if (val > maxPage) {
                                    setPage(maxPage);
                                } else if (val < 1) {
                                    setPage(1);
                                }
                            }
                        }
                    }}
                />
                <span className="text-sm text-gray-500 hidden sm:inline">页</span>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              disabled={page <= 1} 
              onClick={() => setPage(p => p - 1)}
            >
              上一页
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              disabled={page >= (Math.ceil(total / pageSize) || 1)} 
              onClick={() => setPage(p => p + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      </Card>

      {/* Create User Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="创建新用户"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">所属应用</label>
            <select
              required
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
              value={newUser.app_id}
              onChange={(e) => setNewUser({ ...newUser, app_id: e.target.value })}
            >
              <option value="">请选择应用</option>
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="账号 (可选)"
            value={newUser.account}
            onChange={(e) => setNewUser({ ...newUser, account: e.target.value })}
            placeholder="请输入用户登录账号"
          />
          <Input
            label="邮箱"
            type="email"
            required
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            placeholder="请输入用户邮箱"
          />
          <Input
            label="初始密码"
            type="password"
            required
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            placeholder="设置初始登录密码 (至少 6 位)"
            minLength={6}
          />
          <div className="flex justify-end gap-3 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={actionLoading}>
              {actionLoading ? '创建中...' : '确认创建'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Adjust Balance Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="调整用户积分钱包"
        footer={
          <>
            <Button onClick={handleAdjustWallet} loading={actionLoading}>
              确认调整
            </Button>
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={actionLoading}>
              取消
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-md border text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">目标用户:</span>
              <span className="font-medium">{selectedUser?.external_user_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">当前余额:</span>
              <span className="font-medium text-indigo-600">{selectedUser?.platform_wallets?.balance_permanent ?? 0}</span>
            </div>
          </div>

          <Input
            label="调整金额 (正数增加，负数扣除)"
            type="number"
            value={adjustAmount}
            onChange={(e) => setAdjustAmount(parseInt(e.target.value) || 0)}
            placeholder="0"
            icon={<Coins className="h-4 w-4" />}
          />
          
          <Input
            label="调整原因 / 备注"
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
            placeholder="例如：系统补偿、活动赠送..."
          />
          
          <div className="text-xs text-gray-500 bg-yellow-50 p-3 rounded text-yellow-700 border border-yellow-100">
            ⚠️ 注意：此操作不可撤销，并将记录在资金流水中。
          </div>
        </div>
      </Modal>

      {/* User Detail Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="用户详情"
        footer={
            <Button onClick={() => setIsDetailModalOpen(false)}>
              关闭
            </Button>
        }
      >
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="col-span-2">
                    <label className="block text-gray-500 mb-1">用户 ID</label>
                    <div className="font-mono bg-gray-50 p-2 rounded break-all select-all">{selectedUser?.external_user_id}</div>
                </div>
                <div>
                    <label className="block text-gray-500 mb-1">所属应用</label>
                    <div className="font-medium p-2">{selectedUser?.platform_apps?.name}</div>
                </div>
                <div>
                    <label className="block text-gray-500 mb-1">注册时间</label>
                    <div className="p-2">{selectedUser?.created_at ? new Date(selectedUser.created_at).toLocaleString() : '-'}</div>
                </div>
                <div>
                    <label className="block text-gray-500 mb-1">账号</label>
                    <div className="p-2 select-all">{selectedUser?.account || '-'}</div>
                </div>
                <div>
                    <label className="block text-gray-500 mb-1">邮箱</label>
                    <div className="p-2 select-all">{selectedUser?.email || '-'}</div>
                </div>
            </div>

            {selectedUser?.platform_wallets && (
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                    <h4 className="text-indigo-900 font-medium mb-2 flex items-center gap-2">
                        <Wallet className="h-4 w-4" /> 钱包信息
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <span className="text-indigo-600 text-xs uppercase tracking-wider">永久余额</span>
                            <div className="text-2xl font-bold text-indigo-700">{selectedUser.platform_wallets.balance_permanent}</div>
                        </div>
                        <div>
                            <span className="text-indigo-600 text-xs uppercase tracking-wider">临时余额</span>
                            <div className="text-2xl font-bold text-indigo-700">{selectedUser.platform_wallets.balance_temporary}</div>
                        </div>
                    </div>
                </div>
            )}

            <div>
                <label className="block text-gray-500 mb-2">元数据 (Metadata)</label>
                {!selectedUser?.metadata || Object.keys(selectedUser.metadata).length === 0 ? (
                  <div className="text-gray-400 text-sm italic p-2 bg-gray-50 rounded">无元数据</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-4 rounded-lg border border-gray-100">
                    {Object.entries(selectedUser.metadata).map(([key, value]) => {
                      // Check if value follows the { value: any, label: string } pattern
                      const isLabeledValue = value && typeof value === 'object' && 'label' in value && 'value' in value;
                      const displayKey = isLabeledValue ? (value as any).label : key;
                      const displayValue = isLabeledValue ? (value as any).value : value;

                      return (
                        <div key={key} className="flex flex-col border-b border-gray-200 pb-2 last:border-0">
                          <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                            {displayKey}
                            {isLabeledValue && <span className="ml-1 text-[10px] text-gray-400 font-normal">({key})</span>}
                          </span>
                          <span className="text-sm font-medium text-gray-900 break-all">
                            {displayValue === null ? <span className="text-gray-400 italic">null</span> :
                             typeof displayValue === 'boolean' ? (displayValue ? 'Yes' : 'No') :
                             typeof displayValue === 'object' ? JSON.stringify(displayValue) :
                             String(displayValue)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
        </div>
      </Modal>

      {/* Lock/Unlock Confirmation Modal */}
      <Modal
        isOpen={isLockConfirmOpen}
        onClose={() => setIsLockConfirmOpen(false)}
        title={userToLock?.status === 'blocked' ? "解锁用户" : "锁定用户"}
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => setIsLockConfirmOpen(false)}
              disabled={actionLoading}
            >
              取消
            </Button>
            <Button
              variant={userToLock?.status === 'blocked' ? "primary" : "destructive"}
              onClick={confirmToggleLock}
              loading={actionLoading}
            >
              {userToLock?.status === 'blocked' ? "确认解锁" : "确认锁定"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center p-4 rounded-full mx-auto mb-4">
             {userToLock?.status === 'blocked' ? 
                <Unlock className="h-12 w-12 text-green-100 bg-green-500 p-2 rounded-full" /> : 
                <Lock className="h-12 w-12 text-orange-100 bg-orange-500 p-2 rounded-full" />
             }
          </div>
          <p className="text-center text-gray-700 text-base">
            {userToLock?.status === 'blocked' 
              ? `确定要解锁用户 ${userToLock?.email || userToLock?.external_user_id} 吗？`
              : `确定要锁定用户 ${userToLock?.email || userToLock?.external_user_id} 吗？`}
          </p>
          {userToLock?.status !== 'blocked' && (
             <p className="text-center text-sm text-red-600 font-medium bg-red-50 p-2 rounded border border-red-100">
               ⚠️ 锁定后用户将无法登录系统
             </p>
          )}
        </div>
      </Modal>

      {/* Delete User Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="删除用户确认"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={actionLoading}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteUser}
              loading={actionLoading}
              disabled={deleteConfirmationInput !== 'DELETE'}
            >
              确认彻底删除
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center p-4 rounded-full mx-auto mb-4 bg-red-100">
            <Trash2 className="h-12 w-12 text-red-600" />
          </div>
          <div className="text-center">
             <h3 className="text-lg font-medium text-gray-900 mb-2">
               确定要删除用户 {userToDelete?.email || userToDelete?.external_user_id} 吗？
             </h3>
             <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 text-left mb-4">
               <p className="font-bold mb-1">⚠️ 此操作不可恢复！</p>
               <ul className="list-disc list-inside space-y-1">
                 <li>用户的登录账号将被永久删除</li>
                 <li>用户的钱包、余额信息将被清空</li>
                 <li>所有相关的交易记录将被删除</li>
                 <li>此操作无法撤销</li>
               </ul>
             </div>
             <p className="text-sm text-gray-500 mb-2">
               请在下方输入 <span className="font-mono font-bold text-gray-900">DELETE</span> 以确认删除：
             </p>
             <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 font-mono text-center uppercase"
                placeholder="DELETE"
                value={deleteConfirmationInput}
                onChange={(e) => setDeleteConfirmationInput(e.target.value)}
             />
          </div>
        </div>
      </Modal>
    </div>
  );
}
