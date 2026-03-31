import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Search, CreditCard } from 'lucide-react';


export default function OrderManagement() {
  const [activeTab, setActiveTab] = useState<'orders' | 'transactions'>('orders');
  const [data, setData] = useState<any[]>([]);
  const [apps, setApps] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [stats, setStats] = useState<any>(null);

  const loadApps = async () => {
    const { data } = await supabase.from('platform_apps').select('id, name').order('name');
    setApps(data || []);
  };

  const loadStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_recharge_stats', { 
        _app_id: selectedAppId || null 
      });
      if (error) throw error;
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString() });
      if (selectedAppId) params.append('app_id', selectedAppId);
      if (keyword) params.append('keyword', keyword);
      
      // const functionName = activeTab === 'orders' ? 'admin-order-list' : 'admin-transaction-list';
      // if (activeTab === 'orders' && statusFilter) params.append('status', statusFilter);
      // if (activeTab === 'transactions' && statusFilter) params.append('type', statusFilter);

      // const { data: result, error } = await supabase.functions.invoke(`${functionName}?${params.toString()}`);
      
      // Direct DB Query
      const from = (page - 1) * 20;
      const to = from + 19;
      
      let query;
      
      if (activeTab === 'orders') {
        query = supabase
            .from('platform_orders')
            .select('*, platform_apps(name), platform_users(email, external_user_id, metadata)');
        
        if (statusFilter) query = query.eq('status', statusFilter);
        if (keyword) query = query.or(`platform_order_no.ilike.%${keyword}%,merchant_order_no.ilike.%${keyword}%`);
      } else {
        query = supabase
            .from('platform_wallet_transactions')
            .select('*, platform_apps(name), platform_wallets(user_id, platform_users(email, external_user_id))');
            
        if (statusFilter) {
            query = query.eq('type', statusFilter);
        } else {
            // Default filter: only show usage/payment/admin, exclude deposits/rewards
            // User explicitly requested "Redemption stats" (spending), so we filter by amount < 0
            // This is more robust than type filtering if type is missing or inconsistent
            query = query.lt('amount', 0);
        }
        
        // Note: transactions might not have searchable fields like order no easily accessible unless joined
        // Assuming description search or ID search
        if (keyword) query = query.ilike('description', `%${keyword}%`);
      }

      if (selectedAppId) query = query.eq('app_id', selectedAppId);
      
      const { data: resultData, error } = await query
        .range(from, to)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform relations
      const formattedData = (resultData || []).map((item: any) => {
        const app = Array.isArray(item.platform_apps) ? item.platform_apps[0] : item.platform_apps;
        let user = item.platform_users ? (Array.isArray(item.platform_users) ? item.platform_users[0] : item.platform_users) : undefined;
        
        // For transactions, get user from wallet relation
        if (!user && item.platform_wallets) {
          const wallet = Array.isArray(item.platform_wallets) ? item.platform_wallets[0] : item.platform_wallets;
          if (wallet?.platform_users) {
            user = Array.isArray(wallet.platform_users) ? wallet.platform_users[0] : wallet.platform_users;
          }
        }

        return {
          ...item,
          platform_apps: app,
          platform_users: user,
        };
      });

      setData(formattedData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadApps(); }, []);
  useEffect(() => { loadData(); }, [activeTab, page, selectedAppId, statusFilter]);
  useEffect(() => { loadStats(); }, [selectedAppId]);

  const formatDescription = (description: string) => {
    if (!description) return '-';
    let desc = description;
    desc = desc.replace('Recharge via BagelPay', 'BagelPay充值');
    desc = desc.replace('Recharge Bonus', '充值奖励');
    desc = desc.replace('Mock Recharge', '模拟充值');
    desc = desc.replace('deposit', '充值');
    desc = desc.replace('reward', '赠送');
    desc = desc.replace('Usage', '使用');
    desc = desc.replace('Payment', '支付');
    desc = desc.replace('Refund', '退款');
    return desc;
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      paid: '已支付',
      pending: '待支付',
      failed: '失败',
      refunded: '已退款',
      deposit: '充值',
      usage: '消费',
      payment: '消费',
      admin: '管理员调整',
      reward: '活动赠送',
      cumulative_reward: '累计充值奖励',
      invite_reward: '邀请奖励',
      refund: '退款',
      admin_adjustment: '管理员调整'
    };
    const label = statusMap[status] || status || '-';

    const colors: Record<string, any> = {
      paid: 'success',
      pending: 'warning',
      failed: 'error',
      refunded: 'warning',
      deposit: 'success',
      payment: 'warning',
      admin: 'info',
      reward: 'success',
      usage: 'warning',
      invite_reward: 'success',
      cumulative_reward: 'success'
    };
    return <Badge variant={colors[status] || 'default'}>{label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="财务订单管理" 
        description="监控全平台充值订单与钱包交易流水"
        icon={CreditCard}
      />

      {activeTab === 'orders' && stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 flex flex-col justify-center bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
            <div className="text-sm font-medium text-indigo-600 mb-1">今日充值</div>
            <div className="text-2xl font-bold text-gray-900">${(stats.today_amount / 100).toFixed(2)}</div>
          </Card>
          <Card className="p-4 flex flex-col justify-center bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
            <div className="text-sm font-medium text-emerald-600 mb-1">本月充值</div>
            <div className="text-2xl font-bold text-gray-900">${(stats.month_amount / 100).toFixed(2)}</div>
          </Card>
          <Card className="p-4 flex flex-col justify-center bg-gradient-to-br from-blue-50 to-white border-blue-100">
            <div className="text-sm font-medium text-blue-600 mb-1">累计充值 ({stats.total_count}笔)</div>
            <div className="text-2xl font-bold text-gray-900">${(stats.total_amount / 100).toFixed(2)}</div>
          </Card>
        </div>
      )}

      <div className="flex border-b border-gray-200">
        <button
          className={`px-6 py-3 text-sm font-medium ${activeTab === 'orders' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => { setActiveTab('orders'); setPage(1); setStatusFilter(''); }}
        >
          充值订单
        </button>
        <button
          className={`px-6 py-3 text-sm font-medium ${activeTab === 'transactions' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => { setActiveTab('transactions'); setPage(1); setStatusFilter(''); }}
        >
          钱包流水
        </button>
      </div>

      <Card className="p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full sm:w-auto">
          <select
            className="px-4 py-2 border rounded-md text-sm bg-white w-full sm:w-auto"
            value={selectedAppId}
            onChange={(e) => { setSelectedAppId(e.target.value); setPage(1); }}
          >
            <option value="">所有应用</option>
            {apps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}
          </select>

          {activeTab === 'orders' ? (
            <select
              className="px-4 py-2 border rounded-md text-sm bg-white w-full sm:w-auto"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">所有状态</option>
              <option value="pending">待支付</option>
              <option value="paid">已支付</option>
              <option value="failed">失败</option>
            </select>
          ) : (
            <select
              className="px-4 py-2 border rounded-md text-sm bg-white w-full sm:w-auto"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">所有类型</option>
              <option value="payment">支付/消费</option>
              <option value="admin">系统调整</option>
            </select>
          )}

          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="搜索单号..."
              className="pl-10 pr-4 py-2 border rounded-md text-sm w-full sm:w-48"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
            />
          </div>
        </div>
        <Button onClick={() => setPage(1)} className="w-full sm:w-auto">刷新</Button>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              {activeTab === 'orders' ? (
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">充值账号</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">订单号</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">应用</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">充值金额</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">获得积分</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">时间</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">账号</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">应用</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">积分变动</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">描述</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">时间</th>
                </tr>
              )}
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-gray-500">加载中...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-gray-500">暂无数据</td></tr>
              ) : (
                data.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 text-sm">
                    {activeTab === 'orders' ? (
                      <>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{item.platform_users?.email || item.platform_users?.external_user_id || '-'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{item.platform_order_no}</div>
                          <div className="text-xs text-gray-500">{item.merchant_order_no}</div>
                        </td>
                        <td className="px-6 py-4 hidden md:table-cell">{item.platform_apps?.name}</td>
                        <td className="px-6 py-4">{(item.amount / 100).toFixed(2)} {item.currency === 'USD' ? '美元' : item.currency}</td>
                        <td className="px-6 py-4 font-medium text-blue-600">
                          {((item.metadata?.points || Math.floor(item.amount / 100)) + (item.metadata?.bonus_points || 0))} 
                          {item.metadata?.bonus_points ? <span className="text-xs text-gray-500 ml-1">(含赠送 {item.metadata.bonus_points})</span> : ''}
                        </td>
                        <td className="px-6 py-4">{getStatusBadge(item.status)}</td>
                        <td className="px-6 py-4 text-gray-500 hidden lg:table-cell">{new Date(item.created_at).toLocaleString()}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 font-medium">
                          {getStatusBadge(item.type)}
                          <span className="text-xs text-gray-400 ml-1">({item.type})</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{item.platform_users?.email || item.platform_users?.external_user_id || '-'}</div>
                        </td>
                        <td className="px-6 py-4 hidden md:table-cell">{item.platform_apps?.name || '-'}</td>
                        <td className="px-6 py-4 font-medium">
                          <div className={item.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {item.amount >= 0 ? '+' : ''}{item.amount}
                          </div>
                          <div className="text-xs text-gray-400">余额: {item.balance_after ?? 0}</div>
                        </td>
                        <td className="px-6 py-4 text-gray-600">{formatDescription(item.description || item.type)}</td>
                        <td className="px-6 py-4 text-gray-500 hidden lg:table-cell">{new Date(item.created_at).toLocaleString()}</td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-gray-50 px-6 py-3 border-t flex flex-col sm:flex-row justify-between items-center text-sm gap-4">
          <span className="text-gray-500">第 {page} 页</span>
          <div className="flex gap-2 w-full sm:w-auto justify-center sm:justify-end">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
            <Button variant="outline" size="sm" disabled={data.length < 20} onClick={() => setPage(p => p + 1)}>下一页</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
