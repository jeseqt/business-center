import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Search, Wallet, Coins, Calendar, User as UserIcon, Clock } from 'lucide-react';

interface User {
  id: string;
  app_id: string;
  external_user_id: string;
  platform_apps: { name: string };
  platform_wallets: {
    id: string;
    balance_permanent: number;
    balance_temporary: number;
  }[];
  metadata: any;
  created_at: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [emailFilter, setEmailFilter] = useState('');
  
  // Wallet Adjustment State
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

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
      const { error: authError } = await supabase.auth.getUser();
      if (authError) {
        console.warn('Current session token is invalid (likely from previous project). Signing out...');
        await supabase.auth.signOut();
        window.location.reload(); // Force reload to clear any stale state
        return;
      }

      console.log('UserManagement Session Token:', session.access_token ? 'Token exists' : 'No token');

      const params = new URLSearchParams({ page: page.toString() });
      if (emailFilter) params.append('email', emailFilter);
      
      const { data, error } = await supabase.functions.invoke(`admin-user-list?${params.toString()}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${session?.access_token || ''}`
        }
      });
      
      if (error) {
        if (error instanceof Error && 'context' in error) {
          const res = (error as any).context as Response;
          if (res && res.json) {
            try {
                const body = await res.json();
                console.error('Edge Function Error Body:', body);
            } catch (e) {
                console.error('Error parsing error body:', e);
            }
          }
        }
        throw error;
      }
      setUsers(data.data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page]);

  const handleAdjustWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    
    const walletId = selectedUser.platform_wallets[0]?.id;
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
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`
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

  return (
    <div className="space-y-6">
      <PageHeader 
        title="用户与钱包管理" 
        description="查看应用用户、管理钱包余额及交易"
        icon={UserIcon}
        action={
          <div className="flex gap-3 w-full sm:w-auto">
             <div className="relative flex-1 sm:flex-initial">
               <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
               <input
                 type="text"
                 placeholder="按邮箱搜索..."
                 className="pl-10 pr-4 py-2 border rounded-md w-full sm:w-64 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                 value={emailFilter}
                 onChange={(e) => setEmailFilter(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
               />
             </div>
             <Button onClick={() => setPage(1)}>
               搜索
             </Button>
           </div>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">所属应用</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">钱包余额</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                    加载中...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                    暂无用户
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center">
                          <UserIcon className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{user.metadata?.email || '无邮箱'}</div>
                          <div className="text-xs text-gray-500">ID: {user.external_user_id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{user.platform_apps?.name || '未知应用'}</div>
                      <div className="text-xs text-gray-500">App ID: {user.app_id.substring(0, 8)}...</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        {user.platform_wallets.length > 0 ? (
                          <>
                            <div className="flex items-center text-sm font-medium text-gray-900">
                              <Coins className="h-4 w-4 text-yellow-500 mr-1" />
                              {user.platform_wallets[0].balance_permanent} (永久)
                            </div>
                            {user.platform_wallets[0].balance_temporary > 0 && (
                              <div className="flex items-center text-xs text-gray-500">
                                <Clock className="h-3 w-3 mr-1" />
                                +{user.platform_wallets[0].balance_temporary} (临时)
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-sm text-gray-400">无钱包</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-500">
                        <Calendar className="h-4 w-4 mr-1 text-gray-400" />
                        {new Date(user.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                       <Button variant="ghost" size="sm" onClick={() => setDetailUser(user)} className="mr-2">
                         查看详情
                       </Button>
                       {user.platform_wallets.length > 0 && (
                         <Button variant="ghost" size="sm" onClick={() => openAdjustModal(user)}>
                           <Wallet className="h-4 w-4 text-indigo-600" />
                         </Button>
                       )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            当前页: {page}
          </div>
          <div className="flex gap-2">
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
              disabled={users.length < 10} // Simple check
              onClick={() => setPage(p => p + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      </Card>

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
              <span className="font-medium text-indigo-600">{selectedUser?.platform_wallets[0]?.balance_permanent ?? 0}</span>
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
    </div>
  );
}
