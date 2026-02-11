import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { Activity, DollarSign, Database, Calendar, Eye, Code, Search, Filter, X } from 'lucide-react';

interface UsageRecord {
  id: string;
  app_id: string;
  model_name: string;
  total_tokens: number;
  cost_usd: number;
  created_at: string;
  method_name?: string;
  method_label?: string;
  request_metadata?: any;
  app?: {
    name: string;
  };
  platform_user?: {
    id: string;
    account?: string;
    email?: string;
    metadata?: any;
  };
}

interface AppStat {
  name: string;
  total_cost: number;
  total_tokens: number;
}

interface DailyStat {
  date: string;
  cost: number;
  tokens: number;
}

export default function UsageReports() {
  const [statsLoading, setStatsLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [appStats, setAppStats] = useState<AppStat[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [categoryStats, setCategoryStats] = useState<{name: string, value: number}[]>([]);
  const [recentLogs, setRecentLogs] = useState<UsageRecord[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  
  // Options for Dropdowns
  const [appOptions, setAppOptions] = useState<{id: string, name: string}[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  // Filters
  const [filters, setFilters] = useState({
    date: new Date().toISOString().split('T')[0], // Default to today
    app: '',
    user: '',
    method: '',
    model: ''
  });

  // Detail Modal State
  const [selectedLog, setSelectedLog] = useState<UsageRecord | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  useEffect(() => {
    fetchStatsAndOptions();
  }, []);

  useEffect(() => {
    fetchTableData();
  }, [filters.date]); // Re-fetch table when date changes

  const handleSearch = () => {
    fetchTableData();
  };

  const clearFilters = () => {
    const defaultFilters = {
      date: new Date().toISOString().split('T')[0],
      app: '',
      user: '',
      method: '',
      model: ''
    };
    
    const dateChanged = defaultFilters.date !== filters.date;
    setFilters(defaultFilters);
    
    if (!dateChanged) {
      fetchTableData(defaultFilters);
    }
  };

  const fetchStatsAndOptions = async () => {
    setStatsLoading(true);
    try {
      // 1. Fetch Stats Data (Last 30 Days or 1000 records)
      const { data: usageData, error: usageError } = await supabase
        .from('platform_token_usage')
        .select(`
          *,
          app:platform_apps(name),
          platform_user:platform_users(id, account, email, metadata)
        `)
        .order('created_at', { ascending: false })
        .limit(2000); // Larger limit for better stats

      if (usageError) throw usageError;

      if (usageData) {
        processStats(usageData as any[]);
        
        // Extract Model Options
        const models = Array.from(new Set(usageData.map(d => d.model_name))).filter(Boolean).sort();
        setModelOptions(models);
      }

      // 2. Fetch App Options
      const { data: appsData } = await supabase
        .from('platform_apps')
        .select('id, name')
        .order('name');
      
      if (appsData) {
        setAppOptions(appsData);
      }
      
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchTableData = async (overrideFilters?: typeof filters) => {
    setTableLoading(true);
    const activeFilters = overrideFilters || filters;

    try {
      let userIds: string[] | null = null;

      // 1. App Filter is now by ID (if selected from dropdown) or we search by name if it was text (but now it is dropdown)
      // Actually, let's assume `filters.app` stores the app name for search? 
      // User asked for dropdown. So `filters.app` should probably store the App Name or App ID.
      // If I store App Name, I can use ilike. If ID, exact match.
      // Let's use App Name in filter state to be consistent with existing logic, or switch to ID?
      // Existing logic used `ilike name`. 
      // If I use dropdown, I can pass the name directly.
      
      // 2. Resolve User IDs if filtering by User
      if (activeFilters.user) {
        // Check if input is a valid UUID
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activeFilters.user);
        
        let userQuery = supabase.from('platform_users').select('id');
        if (isUUID) {
           userQuery = userQuery.eq('id', activeFilters.user);
        } else {
           userQuery = userQuery.or(`account.ilike.%${activeFilters.user}%,email.ilike.%${activeFilters.user}%`);
        }
        
        const { data } = await userQuery;
        userIds = data?.map(d => d.id) || [];
      }

      // 3. Build Main Query
      let query = supabase
        .from('platform_token_usage')
        .select(`
          *,
          app:platform_apps(name),
          platform_user:platform_users(id, account, email, metadata)
        `)
        .order('created_at', { ascending: false });

      // Date Filter (Server-side)
      if (activeFilters.date) {
        const startDate = new Date(activeFilters.date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(activeFilters.date);
        endDate.setHours(23, 59, 59, 999);
        query = query.gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString());
      }

      // App Filter
      if (activeFilters.app) {
         // If filters.app is a name from dropdown
         // We can't easily filter by joined column in Supabase without !inner or separate lookup.
         // Let's resolve App ID first if we have the name, OR just use the App ID in the filter if we change the dropdown to store ID.
         // Let's assume filters.app stores the NAME for now to match `ilike` logic, 
         // BUT wait, if it's a dropdown, we know the exact name.
         // Better: Find the App ID for the selected name from `appOptions`?
         // Or just change `filters.app` to be App ID?
         // Let's change `filters.app` to store App Name (as string) but use it to look up ID if needed, 
         // OR just filter by `app_id` if we know it.
         // Let's stick to: Dropdown value = App Name.
         // Then we find the app in `appOptions` to get ID?
         // Or just search by name.
         // `platform_apps` is joined as `app`. Filtering by joined column needs careful syntax.
         // Previous code: resolved appIds first.
         const { data } = await supabase.from('platform_apps').select('id').eq('name', activeFilters.app);
         const appIds = data?.map(d => d.id) || [];
         if (appIds.length > 0) {
            query = query.in('app_id', appIds);
         } else if (data && data.length === 0) {
             setRecentLogs([]); setTableLoading(false); return;
         }
      }

      if (userIds !== null) {
        if (userIds.length === 0) {
          setRecentLogs([]); setTableLoading(false); return;
        }
        query = query.in('platform_user_id', userIds);
      }

      // Other Filters
      if (activeFilters.model) {
        query = query.eq('model_name', activeFilters.model); // Exact match for dropdown
      }
      
      if (activeFilters.method) {
        query = query.or(`method_name.ilike.%${activeFilters.method}%,method_label.ilike.%${activeFilters.method}%`);
      }

      const { data: usageData, error: usageError } = await query.limit(1000);

      if (usageError) throw usageError;

      if (usageData) {
        setRecentLogs(usageData as any[]);
      }
    } catch (error) {
      console.error('Error fetching table data:', error);
    } finally {
      setTableLoading(false);
    }
  };

  const getUserDisplayName = (user: UsageRecord['platform_user']) => {
    if (!user) return '-';
    if (user.account) return user.account;
    if (user.email) return user.email;
    if (user.metadata?.name) return user.metadata.name;
    if (user.metadata?.username) return user.metadata.username;
    if (user.metadata?.nickname) return user.metadata.nickname;
    return 'User-' + user.id.slice(0, 6);
  };

  const openDetailModal = (log: UsageRecord) => {
    setSelectedLog(log);
    setIsDetailModalOpen(true);
  };

  const processStats = (data: UsageRecord[]) => {
    let total = 0;
    const appMap = new Map<string, AppStat>();
    const categoryMap = new Map<string, number>();
    const dateMap = new Map<string, DailyStat>();

    data.forEach(record => {
      total += record.cost_usd || 0;

      // Group by App
      const appName = record.app?.name || '未知应用';
      const appStat = appMap.get(appName) || { name: appName, total_cost: 0, total_tokens: 0 };
      appStat.total_cost += record.cost_usd || 0;
      appStat.total_tokens += record.total_tokens || 0;
      appMap.set(appName, appStat);

      // Group by Category (Simulated based on name keywords)
      let category = '其他';
      if (appName.includes('商城') || appName.includes('Shop') || appName.includes('电商')) category = '电商应用';
      else if (appName.includes('Chat') || appName.includes('AI') || appName.includes('Bot')) category = 'AI 对话';
      else if (appName.includes('Tool') || appName.includes('工具')) category = '工具类';
      else if (appName.includes('Game') || appName.includes('游戏')) category = '游戏娱乐';
      
      categoryMap.set(category, (categoryMap.get(category) || 0) + (record.cost_usd || 0));

      // Group by Date
      const date = new Date(record.created_at).toLocaleDateString();
      const dailyStat = dateMap.get(date) || { date, cost: 0, tokens: 0 };
      dailyStat.cost += record.cost_usd || 0;
      dailyStat.tokens += record.total_tokens || 0;
      dateMap.set(date, dailyStat);
    });

    setTotalCost(total);
    setAppStats(Array.from(appMap.values()));
    setCategoryStats(Array.from(categoryMap.entries()).map(([name, value]) => ({ name, value })));
    // Sort daily stats by date
    setDailyStats(Array.from(dateMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
  };

  if (statsLoading) {
    return <div className="p-8 text-center text-gray-500">加载统计数据中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader 
        title="业务用量报表" 
        description="查看各应用 Token 消耗与成本趋势"
        icon={Activity}
        action={
          <div className="text-right">
             <div className="text-sm text-gray-500">总预估成本</div>
             <div className="text-2xl font-bold text-indigo-600">${totalCost.toFixed(4)}</div>
          </div>
        }
      />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost by App */}
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-brand-50 rounded-lg border border-brand-100">
              <Database className="h-5 w-5 text-brand-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">各应用成本分布 (USD)</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={appStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="total_cost" name="成本 ($)" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Daily Trend */}
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-brand-50 rounded-lg border border-brand-100">
              <Calendar className="h-5 w-5 text-brand-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">每日消耗趋势 (Tokens)</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="tokens" name="Tokens" stroke="#10b981" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">日期</label>
            <input
              type="date"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
              value={filters.date}
              onChange={(e) => setFilters({...filters, date: e.target.value})}
            />
          </div>
          <div className="w-full md:w-auto md:flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">应用名称</label>
            <select
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border bg-white"
              value={filters.app}
              onChange={(e) => setFilters({...filters, app: e.target.value})}
            >
              <option value="">全部应用</option>
              {appOptions.map(app => (
                <option key={app.id} value={app.name}>{app.name}</option>
              ))}
            </select>
          </div>
          <div className="w-full md:w-auto md:flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">用户 (ID/账号/邮箱)</label>
            <input
              type="text"
              placeholder="搜索用户..."
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
              value={filters.user}
              onChange={(e) => setFilters({...filters, user: e.target.value})}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div className="w-full md:w-auto md:flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">方法/标签</label>
            <input
              type="text"
              placeholder="搜索方法..."
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
              value={filters.method}
              onChange={(e) => setFilters({...filters, method: e.target.value})}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div className="w-full md:w-auto md:flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">模型</label>
            <select
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border bg-white"
              value={filters.model}
              onChange={(e) => setFilters({...filters, model: e.target.value})}
            >
              <option value="">全部模型</option>
              {modelOptions.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 w-full md:w-auto justify-end">
            <Button onClick={handleSearch} className="flex items-center gap-1" disabled={tableLoading}>
              <Search className="h-4 w-4" />
              {tableLoading ? '查询中...' : '查询'}
            </Button>
            <Button variant="ghost" onClick={clearFilters} className="text-gray-500 flex items-center gap-1 border border-gray-300">
              <X className="h-4 w-4" />
              重置
            </Button>
          </div>
        </div>
      </Card>

      {/* Recent Logs Table */}
      <Card className="overflow-hidden relative min-h-[300px]">
        {tableLoading && (
          <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        )}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">调用记录 ({recentLogs.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">应用</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">模型/方法</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Tokens</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">成本</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 hidden md:table-cell">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {log.app?.name || '未知'}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                     <div className="font-medium text-gray-900">{getUserDisplayName(log.platform_user)}</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell">
                    <div className="flex flex-col">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-indigo-50 text-indigo-700 w-fit">
                        {log.model_name}
                      </span>
                      {log.method_label && <span className="text-xs text-gray-400 mt-1 ml-1">{log.method_label}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                    {log.total_tokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                    ${log.cost_usd?.toFixed(6)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-center sticky right-0 bg-white shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]">
                    <Button variant="ghost" size="sm" onClick={() => openDetailModal(log)} className="text-indigo-600 hover:text-indigo-900 flex items-center gap-1 mx-auto">
                      <Eye className="h-4 w-4" />
                      <span>详情</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="调用详情"
        footer={
          <Button onClick={() => setIsDetailModalOpen(false)}>关闭</Button>
        }
      >
        {selectedLog && (
          <div className="space-y-4">
            {/* User Info */}
            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Database className="h-4 w-4 text-indigo-500" />
                用户与应用信息
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="block text-xs text-gray-500">用户显示名</label>
                  <div className="font-medium text-gray-900">{getUserDisplayName(selectedLog.platform_user)}</div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500">应用名称</label>
                  <div className="font-medium text-gray-900">{selectedLog.app?.name || '未知'}</div>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500">用户 ID (UUID)</label>
                  <div className="font-mono text-xs bg-white p-1 rounded border border-gray-200 text-gray-600 select-all">
                    {selectedLog.platform_user?.id || 'N/A'}
                  </div>
                </div>
                <div>
                   <label className="block text-xs text-gray-500">账号</label>
                   <div className="text-gray-900">{selectedLog.platform_user?.account || '-'}</div>
                </div>
                <div>
                   <label className="block text-xs text-gray-500">邮箱</label>
                   <div className="text-gray-900">{selectedLog.platform_user?.email || '-'}</div>
                </div>
              </div>
            </div>

            {/* Usage Info */}
            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-500" />
                调用消耗详情
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="block text-xs text-gray-500">模型 (Model)</label>
                  <div className="font-medium text-gray-900">{selectedLog.model_name}</div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500">方法 (Method)</label>
                  <div className="text-gray-900">{selectedLog.method_label || selectedLog.method_name || '-'}</div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Tokens</label>
                  <div className="font-mono text-indigo-600 font-bold">{selectedLog.total_tokens.toLocaleString()}</div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500">预估成本</label>
                  <div className="font-mono text-green-600 font-bold">${selectedLog.cost_usd?.toFixed(6)}</div>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500">调用时间</label>
                  <div className="text-gray-900">{new Date(selectedLog.created_at).toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* Metadata */}
            {selectedLog.request_metadata && Object.keys(selectedLog.request_metadata).length > 0 && (
              <div className="bg-gray-50 p-4 rounded-md">
                <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <Code className="h-4 w-4 text-orange-500" />
                  Request Metadata
                </h4>
                <div className="text-xs font-mono bg-white p-2 rounded border border-gray-200 overflow-x-auto max-h-40">
                  <pre>{JSON.stringify(selectedLog.request_metadata, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
