import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Loader2, CheckCircle, XCircle, Play } from 'lucide-react';

export default function StressTest() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState({ total: 0, success: 0, failed: 0, avgTime: 0 });

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  const runTest = async () => {
    setIsRunning(true);
    setLogs([]);
    setStats({ total: 0, success: 0, failed: 0, avgTime: 0 });
    
    addLog('Starting stress test (50 iterations)...');
    
    let totalTime = 0;
    let successCount = 0;
    let failCount = 0;

    for (let i = 1; i <= 50; i++) {
      const start = performance.now();
      try {
        // Test RPC call
        const { data, error } = await supabase.rpc('get_or_create_user_dashboard_data');
        
        const duration = performance.now() - start;
        totalTime += duration;

        if (error) {
          throw error;
        }

        if (!data || !data.wallet) {
            throw new Error('Invalid data structure returned');
        }

        successCount++;
        addLog(`Request #${i}: Success (${duration.toFixed(2)}ms)`);
      } catch (err: any) {
        failCount++;
        addLog(`Request #${i}: Failed - ${err.message}`);
      }
      
      // Update stats in real-time
      setStats({
        total: i,
        success: successCount,
        failed: failCount,
        avgTime: totalTime / i
      });

      // Small delay to prevent browser freeze
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setIsRunning(false);
    addLog('Stress test completed.');
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">RPC Stress Test</h1>
          <Button onClick={runTest} disabled={isRunning} className="flex items-center gap-2">
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isRunning ? 'Running...' : 'Start Test'}
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-sm text-slate-500">Total Requests</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </div>
          <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100 text-emerald-700">
            <div className="text-sm opacity-80">Success</div>
            <div className="text-2xl font-bold flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              {stats.success}
            </div>
          </div>
          <div className="p-4 bg-rose-50 rounded-lg border border-rose-100 text-rose-700">
            <div className="text-sm opacity-80">Failed</div>
            <div className="text-2xl font-bold flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              {stats.failed}
            </div>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-blue-700">
            <div className="text-sm opacity-80">Avg Latency</div>
            <div className="text-2xl font-bold">{stats.avgTime.toFixed(2)}ms</div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg p-4 h-[400px] overflow-y-auto font-mono text-xs text-slate-300">
          {logs.map((log, i) => (
            <div key={i} className="border-b border-slate-800/50 py-1 last:border-0">
              {log}
            </div>
          ))}
          {logs.length === 0 && <div className="text-slate-600 italic">Ready to start...</div>}
        </div>
      </div>
    </div>
  );
}
