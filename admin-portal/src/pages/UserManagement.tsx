import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { Search, Wallet, MoreHorizontal, Coins, Calendar, User as UserIcon } from 'lucide-react';

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
      const params = new URLSearchParams({ page: page.toString() });
      if (emailFilter) params.append('email', emailFilter);
      
      const { data, error } = await supabase.functions.invoke(`admin-user-list?${params.toString()}`, {
        method: 'GET'
      });
      
      if (error) throw error;
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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex gap-2 w-full max-w-md">
          <Input 
            placeholder="搜索用户 ID 或邮箱..." 
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            className="w-full"
            icon={<Search className="h-4 w-4" />}
          />
          <Button onClick={loadData} variant="secondary">搜索</Button>
        </div>
      </div>

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b text-gray-500">
              <tr>
                <th className="px-6 py-4 font-medium">用户标识</th>
                <th className="px-6 py-4 font-medium">所属应用</th>
                <th className="px-6 py-4 font-medium">永久积分</th>
                <th className="px-6 py-4 font-medium">临时积分</th>
                <th className="px-6 py-4 font-medium">注册时间</th>
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
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    暂无用户数据
                  </td>
                </tr>
              ) : users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                        <UserIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{user.external_user_id}</div>
                        <div className="text-xs text-gray-500 font-mono">{user.id.slice(0, 8)}...</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline">{user.platform_apps?.name || 'Unknown App'}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-mono font-medium text-indigo-600">
                      {user.platform_wallets[0]?.balance_permanent ?? 0}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-mono text-gray-600">
                      {user.platform_wallets[0]?.balance_temporary ?? 0}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Calendar className="h-3 w-3" />
                      {new Date(user.created_at).toLocaleDateString('zh-CN')}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => openAdjustModal(user)}
                      className="gap-2"
                    >
                      <Wallet className="h-3 w-3" />
                      调整积分
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination could go here */}
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
              disabled={users.length < 10} // Assuming 10 per page
            >
              下一页
            </Button>
          </div>
        </div>
      </div>

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
