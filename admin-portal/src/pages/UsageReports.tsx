import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Activity, DollarSign, Database, Calendar } from 'lucide-react';

interface UsageRecord {
  id: string;
  app_id: string;
  model_name: string;
  total_tokens: number;
  cost_usd: number;
  created_at: string;
  app?: {
    name: string;
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
  const [loading, setLoading] = useState(true);
  const [appStats, setAppStats] = useState<AppStat[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [recentLogs, setRecentLogs] = useState<UsageRecord[]>([]);
  const [totalCost, setTotalCost] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Usage Data
      const { data: usageData, error: usageError } = await supabase
        .from('platform_token_usage')
        .select(`
          *,
          app:platform_apps(name)
        `)
        .order('created_at', { ascending: false })
        .limit(1000); // Limit for performance demo

      if (usageError) throw usageError;

      if (usageData) {
        processStats(usageData as any[]);
        setRecentLogs(usageData as any[]);
      }
    } catch (error) {
      console.error('Error fetching usage data:', error);
    } finally {
      setLoading(false);
    }
  };

  const processStats = (data: UsageRecord[]) => {
    let total = 0;
    const appMap = new Map<string, AppStat>();
    const dateMap = new Map<string, DailyStat>();

    data.forEach(record => {
      total += record.cost_usd || 0;

      // Group by App
      const appName = record.app?.name || 'Unknown App';
      const appStat = appMap.get(appName) || { name: appName, total_cost: 0, total_tokens: 0 };
      appStat.total_cost += record.cost_usd || 0;
      appStat.total_tokens += record.total_tokens || 0;
      appMap.set(appName, appStat);

      // Group by Date
      const date = new Date(record.created_at).toLocaleDateString();
      const dailyStat = dateMap.get(date) || { date, cost: 0, tokens: 0 };
      dailyStat.cost += record.cost_usd || 0;
      dailyStat.tokens += record.total_tokens || 0;
      dateMap.set(date, dailyStat);
    });

    setTotalCost(total);
    setAppStats(Array.from(appMap.values()));
    // Sort daily stats by date
    setDailyStats(Array.from(dateMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">加载数据中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex items-center gap-3">
            <div className="bg-purple-100 p-2 rounded-lg">
                <Activity className="h-5 w-5 text-purple-600" />
            </div>
            <div>
                <h2 className="text-lg font-medium text-gray-900">业务用量报表</h2>
                <p className="text-xs text-gray-500">查看各应用 Token 消耗与成本趋势</p>
            </div>
        </div>
        <div className="text-right">
           <div className="text-sm text-gray-500">总预估成本</div>
           <div className="text-2xl font-bold text-gray-900">${totalCost.toFixed(4)}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost by App */}
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <h3 className="text-sm font-medium text-gray-700 mb-4 flex items-center gap-2">
            <Database className="h-4 w-4" />
            各应用成本分布 (USD)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={appStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="total_cost" name="成本 ($)" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Trend */}
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <h3 className="text-sm font-medium text-gray-700 mb-4 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            每日消耗趋势 (Tokens)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="tokens" name="Tokens" stroke="#82ca9d" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Logs Table */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="text-sm font-medium text-gray-700">最近 100 条调用记录</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">应用</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">模型</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Tokens</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">成本</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentLogs.slice(0, 100).map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {log.app?.name || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      {log.model_name}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                    {log.total_tokens.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                    ${log.cost_usd?.toFixed(6)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
