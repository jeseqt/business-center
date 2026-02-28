import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { BannerCarousel } from '../components/BannerCarousel';
import { User, LogOut, Wallet, History, Loader2, AlertCircle } from 'lucide-react';
import { PlatformWallet, PlatformWalletTransaction } from '../types/shared';
import { Session } from '@supabase/supabase-js';

interface UserHomeProps {
  session: Session | null;
}

export default function UserHome({ session }: UserHomeProps) {
  const [user, setUser] = useState<any>(session?.user || null);
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [wallet, setWallet] = useState<PlatformWallet | null>(null);
  const [transactions, setTransactions] = useState<PlatformWalletTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Sync user state with session prop if it changes
    if (session?.user) {
      setUser(session.user);
    }
  }, [session]);

  const handleLogout = () => {
    // 立即清除所有本地存储，不等待后端响应
    console.log('Logging out immediately...');
    localStorage.clear();
    sessionStorage.clear();
    
    // 尝试通知后端（非阻塞）
    supabase.auth.signOut().catch(console.error);

    // 强制跳转
    window.location.href = '/';
  };

  // Fetch data useEffect
  useEffect(() => {
    let mounted = true;
    let fetchTimeoutTimer: any;
    
    // Safety check: ensure we have a valid user
    if (!session?.user) {
        setLoading(false);
        return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setTransactionsLoading(true);
      
      const withTimeout = async (promise: PromiseLike<any>, ms: number, label: string) => {
        const timeoutPromise = new Promise((_, reject) => {
          const id = setTimeout(() => {
            clearTimeout(id);
            reject(new Error(`${label} timed out after ${ms}ms`));
          }, ms);
        });

        try {
          const result = await Promise.race([promise, timeoutPromise]);
          return result;
        } catch (error) {
          console.error(`[UserHome] ${label} failed/timed out:`, error);
          throw error;
        }
      };

      const collectDiagnostics = async () => {
        let diagInfo = '';
        try {
          const schemaRes = await withTimeout(
            supabase.rpc('debug_schema_info', { p_table: 'platform_users', p_column: 'external_user_id' }),
            6000,
            'Debug schema'
          );
          if (!schemaRes.error && schemaRes.data) {
            diagInfo += `schema:${schemaRes.data}`;
          }
        } catch (schemaErr) {
          console.warn('[UserHome] Diagnostics schema failed:', schemaErr);
        }

        try {
          const dbRes = await withTimeout(
            supabase.rpc('debug_database_state'),
            6000,
            'Debug database state'
          );
          if (!dbRes.error && dbRes.data) {
            const locks = Array.isArray(dbRes.data.locks) ? dbRes.data.locks.length : 0;
            const queries = Array.isArray(dbRes.data.queries) ? dbRes.data.queries.length : 0;
            diagInfo += `${diagInfo ? ' ' : ''}locks:${locks} queries:${queries}`;
          }
        } catch (dbErr) {
          console.warn('[UserHome] Diagnostics db failed:', dbErr);
        }

        return diagInfo;
      };

      let lastStage = 'init';
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      let restProbeNote = '';

      // Global timeout for the entire operation
      fetchTimeoutTimer = setTimeout(() => {
        if (mounted && loading) {
            console.warn('[UserHome] Global fetch timeout reached (30s)');
            void (async () => {
              const diagInfo = await collectDiagnostics();
              setLoading(false);
              setError(`请求超时，请检查网络连接${lastStage ? `（stage:${lastStage}` : ''}${diagInfo ? ` ${diagInfo}` : ''}）`);
            })();
        }
      }, 30000);

      // Pre-flight check: Ensure connection is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        let activeSession = session;

        const ensureValidSession = async () => {
            lastStage = 'session';
            // 优先使用父组件传入的 session，避免刷新后重复等待
            if (activeSession?.user) {
                // 已有有效会话，直接使用
            } else {
                // 尝试快速获取一次会话
                const { data: { session: s1 } } = await supabase.auth.getSession();
                if (s1?.user) {
                    activeSession = s1;
                } else {
                    // 简短轮询 3s，避免长时间阻塞首屏
                    const start = Date.now();
                    while (Date.now() - start < 3000) {
                        const { data: { session: s } } = await supabase.auth.getSession();
                        if (s?.user) {
                            activeSession = s;
                            break;
                        }
                        await new Promise(r => setTimeout(r, 200));
                    }
                }
            }

            // 如仍无用户信息，尝试刷新令牌
            if (!activeSession?.user) {
                const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
                if (refreshError || !refreshData?.session) {
                    throw refreshError || new Error('会话已失效');
                }
                activeSession = refreshData.session;
            }

            if (mounted && activeSession?.user) {
                setUser(activeSession.user);
            }
        };

        const probeRestApi = async () => {
            lastStage = 'rest-probe';
            if (!supabaseUrl || !supabaseAnonKey) {
                throw new Error('缺少 Supabase 配置');
            }
            const keyParts = supabaseAnonKey.split('.');
            const keyType = keyParts.length === 3 ? 'jwt' : 'non-jwt';
            const headers: Record<string, string> = {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${activeSession?.access_token || supabaseAnonKey}`
            };
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            try {
                const res = await fetch(
                    `${supabaseUrl}/rest/v1/platform_apps?select=id&limit=1`,
                    { headers, signal: controller.signal }
                );
                if (!res.ok) {
                    throw new Error(`REST ${res.status} (${keyType})`);
                }
                restProbeNote = `rest:ok(${keyType})`;
            } catch (e: any) {
                if (e?.name === 'AbortError') {
                    restProbeNote = `rest-timeout(${keyType})`;
                    throw new Error(`REST timeout (${keyType})`);
                }
                restProbeNote = `rest-error:${e?.message || 'unknown'} (${keyType})`;
                throw e;
            } finally {
                clearTimeout(timeoutId);
            }
        };

        const probeTableApi = async (uid: string) => {
            lastStage = 'rest-probe-platform_users';
            if (!supabaseUrl || !supabaseAnonKey) return;
            const headers: Record<string, string> = {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${activeSession?.access_token || supabaseAnonKey}`
            };
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            try {
                const url = `${supabaseUrl}/rest/v1/platform_users?select=id&external_user_id=eq.${uid}&limit=1`;
                const res = await fetch(url, { headers, signal: controller.signal });
                if (!res.ok) {
                    restProbeNote += ` table:${res.status}`;
                } else {
                    restProbeNote += ` table:ok`;
                }
            } catch (e: any) {
                restProbeNote += ` table:${e?.name === 'AbortError' ? 'timeout' : 'error'}`;
            } finally {
                clearTimeout(timeoutId);
            }
        };

        const restGet = async (path: string, label: string) => {
            if (!supabaseUrl || !supabaseAnonKey) {
                throw new Error('缺少 Supabase 配置');
            }
            const headers: Record<string, string> = {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${activeSession?.access_token || supabaseAnonKey}`
            };
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            try {
                const res = await fetch(`${supabaseUrl}${path}`, { headers, signal: controller.signal });
                if (!res.ok) {
                    throw new Error(`${label} REST ${res.status}`);
                }
                return await res.json();
            } catch (e: any) {
                if (e?.name === 'AbortError') {
                    throw new Error(`${label} REST timeout`);
                }
                throw e;
            } finally {
                clearTimeout(timeoutId);
            }
        };

        // Wrapper for timeouts
        // 1. Try RPC once, fallback quickly if it is slow
        console.log('[UserHome] Attempting RPC fetch (fast path)...');
        lastStage = 'rpc';
        
        let dashboardData = null;
        let rpcError = null;
        
        // Ensure session is fresh before RPC
        try {
            await ensureValidSession();
            await probeRestApi();
        } catch (sessionErr) {
            console.warn('[UserHome] Session validation failed:', sessionErr);
            throw sessionErr;
        }

        // Retry logic loop
        const MAX_RETRIES = 1;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            if (!mounted) break;
            
            try {
                const timeoutMs = 3000;

                const result = await withTimeout(
                    supabase.rpc('get_or_create_user_dashboard_data'),
                    timeoutMs,
                    `RPC Fetch (Attempt ${attempt})`
                );
                
                if (result.error) {
                    console.error('[UserHome] RPC Error details:', result.error);
                    throw result.error;
                }
                
                dashboardData = result.data;
                rpcError = null;
                break; // Success!
            } catch (err) {
                console.warn(`[UserHome] RPC Attempt ${attempt} failed:`, err);
                rpcError = err;
            }
        }
        
        // Check for specific RPC error return (handled in SQL)
        if (dashboardData && dashboardData.error) {
            console.warn('[UserHome] RPC returned logic error:', dashboardData.error);
            rpcError = new Error(dashboardData.error);
            dashboardData = null;
        }

        if (!rpcError && dashboardData && mounted) {
            console.log('[UserHome] RPC success:', dashboardData);
            if (dashboardData.wallet) setWallet(dashboardData.wallet);
            if (dashboardData.transactions) setTransactions(dashboardData.transactions);
            
            setLoading(false);
            setTransactionsLoading(false);
            return;
        }
        
        if (rpcError) {
            try {
                lastStage = 'fallback-platform_user';
                const uid = activeSession?.user?.id;
                if (!uid) {
                    throw new Error('会话已失效');
                }
                // REST 直连表探针（不阻断主流程）
                void (async () => {
                    if (uid) await probeTableApi(uid);
                })();
                const platformUserList = await withTimeout(
                    restGet(
                        `/rest/v1/platform_users?${new URLSearchParams({
                            select: '*',
                            external_user_id: `eq.${uid}`,
                            limit: '1'
                        }).toString()}`,
                        'platform_user fetch'
                    ),
                    8000,
                    'Direct platform_user fetch'
                );
                const pu = Array.isArray(platformUserList) ? platformUserList[0] : null;
                if (!pu) {
                    throw new Error('未找到用户档案');
                }
                lastStage = 'fallback-wallet';
                const walletList = await withTimeout(
                    restGet(
                        `/rest/v1/platform_wallets?${new URLSearchParams({
                            select: '*',
                            platform_user_id: `eq.${pu.id}`,
                            limit: '1'
                        }).toString()}`,
                        'wallet fetch'
                    ),
                    8000,
                    'Direct wallet fetch'
                );
                const w = Array.isArray(walletList) ? walletList[0] : null;
                if (!w || !w.id) {
                    if (mounted) {
                        setWallet(null);
                        setTransactions([]);
                        setLoading(false);
                        setTransactionsLoading(false);
                        return;
                    }
                }
                lastStage = 'fallback-transactions';
                const txList = await withTimeout(
                    restGet(
                        `/rest/v1/platform_wallet_transactions?${new URLSearchParams({
                            select: '*',
                            wallet_id: `eq.${w.id}`,
                            order: 'created_at.desc',
                            limit: '5'
                        }).toString()}`,
                        'transactions fetch'
                    ),
                    8000,
                    'Direct transactions fetch'
                );
                if (mounted) {
                    setWallet(w);
                    setTransactions(Array.isArray(txList) ? txList : []);
                    setLoading(false);
                    setTransactionsLoading(false);
                    return;
                }
            } catch (fbErr) {
                throw fbErr;
            }
        }

      } catch (err: any) {
        console.error('[UserHome] Critical error:', err);
        if (mounted) {
            const diagInfo = await collectDiagnostics();
            setLoading(false);
            // Friendly error message
            let msg = err.message || '未知错误';
            if (msg.includes('timeout')) msg = '网络连接超时，请刷新重试';
            setError(`数据加载失败: ${msg}${lastStage ? `（stage:${lastStage}` : ''}${diagInfo ? ` ${diagInfo}` : ''}${restProbeNote ? ` ${restProbeNote}` : ''}）`);
        }
      } finally {
        if (mounted && loading) setLoading(false);
        if (fetchTimeoutTimer) clearTimeout(fetchTimeoutTimer);
      }
    };

    fetchData();

    return () => {
        mounted = false;
        if (fetchTimeoutTimer) clearTimeout(fetchTimeoutTimer);
    };
  }, [session]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-8 relative overflow-hidden bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px]">
      
      <div className="max-w-5xl mx-auto space-y-8 relative z-10">
        {/* Header */}
        <div className="flex justify-between items-center bg-white/80 backdrop-blur-xl p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl shadow-lg shadow-brand-500/20 text-white">
              <User className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">朗伯余弦APP平台-个人中心</h1>
              </div>
              <p className="text-sm text-slate-500 mt-1 font-medium">个人中心 / {user?.email}</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={handleLogout} 
            className="text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-slate-200 shadow-sm"
          >
            <LogOut className="w-4 h-4 mr-2" />
            退出登录
          </Button>
        </div>

        {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>{error}</p>
                <Button variant="ghost" size="sm" onClick={() => window.location.reload()} className="text-rose-700 underline ml-auto hover:text-rose-800 hover:bg-rose-100">
                    刷新重试
                </Button>
            </div>
        )}

        <div className="grid gap-6 md:grid-cols-12">
            {/* Banner Carousel - Full Width */}
          <div className="md:col-span-12">
            <BannerCarousel />
          </div>

          {/* Wallet Card - Main Feature */}
          <div className="md:col-span-7 space-y-6">
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-lg shadow-slate-200/50 relative overflow-hidden group h-full">
              
              <div className="flex items-center justify-between mb-6 relative">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <Wallet className="w-5 h-5 text-brand-600" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">我的钱包</h2>
                </div>
                <div className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                  最后同步: {wallet ? new Date(wallet.updated_at).toLocaleTimeString() : '--:--:--'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 relative">
                <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 hover:border-brand-500/30 transition-colors group/card">
                  <div className="text-sm text-slate-500 font-medium mb-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span>
                    永久积分
                  </div>
                  <div className="text-3xl font-bold text-slate-900 tracking-tight group-hover/card:text-brand-600 transition-colors">
                    {loading ? (
                      <div className="h-9 w-24 bg-slate-200 rounded animate-pulse" />
                    ) : (
                      wallet?.balance_permanent?.toLocaleString() ?? 0
                    )}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">永久额度</div>
                </div>
                <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 hover:border-emerald-500/30 transition-colors group/card">
                  <div className="text-sm text-slate-500 font-medium mb-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                    临时积分
                  </div>
                  <div className="text-3xl font-bold text-slate-900 tracking-tight group-hover/card:text-emerald-600 transition-colors">
                    {loading ? (
                      <div className="h-9 w-24 bg-slate-200 rounded animate-pulse" />
                    ) : (
                      wallet?.balance_temporary?.toLocaleString() ?? 0
                    )}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">临时额度</div>
                </div>
              </div>
            </div>
          </div>

          {/* Transactions */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-lg shadow-slate-200/50 h-[400px] flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <History className="w-5 h-5 text-brand-600" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">最近交易</h2>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {transactionsLoading ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-brand-500 animate-spin opacity-50" />
                  </div>
                ) : transactions.length > 0 ? (
                  transactions.map((tx) => (
                    <div key={tx.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100 hover:bg-slate-100 hover:border-slate-200 transition-all group">
                      <div>
                        <div className="font-medium text-slate-700 flex items-center gap-3">
                          <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                            tx.type === 'deposit' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                            tx.type === 'usage' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 
                            'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}>
                            {tx.type === 'deposit' ? '充值' : tx.type === 'usage' ? '消费' : tx.type}
                          </span>
                          {tx.description && <span className="text-sm text-slate-500 group-hover:text-slate-700 transition-colors">
                            {tx.description}
                          </span>}
                        </div>
                        <div className="text-xs text-slate-400 mt-1.5 font-mono">
                          {new Date(tx.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className={`font-bold font-mono text-lg ${tx.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                    <History className="w-8 h-8 mb-2 opacity-20" />
                    <p>暂无交易记录</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

  </div>
  );
}
