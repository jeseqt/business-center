import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { BannerCarousel } from '../components/BannerCarousel';
import { User, LogOut, History, AlertCircle } from 'lucide-react';
import { PlatformWallet, PlatformWalletTransaction } from '../types/shared';
import { Session } from '@supabase/supabase-js';
import { RechargePanel } from '../components/RechargePanel';
import { TransactionsDialog } from '../components/TransactionsDialog';
import { RechargeSuccessDialog } from '../components/RechargeSuccessDialog';
import { LambertCoin } from '../components/LambertCoin';

interface UserHomeProps {
  session: Session | null;
}

export default function UserHome({ session }: UserHomeProps) {
  const [user, setUser] = useState<any>(session?.user || null);
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [wallet, setWallet] = useState<PlatformWallet | null>(null);
  const [transactions, setTransactions] = useState<PlatformWalletTransaction[]>([]);
  const [showTransactions, setShowTransactions] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for recharge success
    const params = new URLSearchParams(window.location.search);
    if (params.get('status') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
      setShowSuccessDialog(true);
    }
  }, []);

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

      let lastStage = 'init';
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      let restProbeNote = '';

      // Global timeout for the entire operation
      fetchTimeoutTimer = setTimeout(() => {
        if (mounted && loading) {
            console.warn('[UserHome] Global fetch timeout reached (30s)');
            void (async () => {
              setLoading(false);
              setError(`请求超时，请检查网络连接${lastStage ? `（stage:${lastStage}）` : ''}`);
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
            // const diagInfo = await collectDiagnostics(); // Removed as it was undefined in snippet
            setLoading(false);
            // Friendly error message
            let msg = err.message || '未知错误';
            if (msg.includes('timeout')) msg = '网络连接超时，请刷新重试';
            setError(`数据加载失败: ${msg}${lastStage ? `（stage:${lastStage}` : ''}${restProbeNote ? ` ${restProbeNote}` : ''}）`);
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
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-x-hidden">
      {/* 顶部背景装饰 */}
      <div className="fixed top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-white to-[#F8FAFC] z-0 pointer-events-none" />
      <div className="fixed top-[-10%] right-[-5%] w-[40%] h-[40%] bg-indigo-50/50 rounded-full blur-[120px] mix-blend-multiply pointer-events-none" />
      <div className="fixed top-[10%] left-[-10%] w-[40%] h-[40%] bg-blue-50/50 rounded-full blur-[120px] mix-blend-multiply pointer-events-none" />

      <div className="relative z-10 max-w-[1200px] mx-auto px-6 py-10 space-y-10">
        
        {/* Header: 极简风格 */}
        <header className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 shadow-[0_4px_12px_rgba(0,0,0,0.03)] flex items-center justify-center text-slate-400 group hover:scale-105 transition-transform duration-300">
                    <User className="w-6 h-6 group-hover:text-indigo-500 transition-colors" />
                </div>
                <div className="flex flex-col">
                    <span className="text-base font-bold text-slate-900 tracking-tight truncate max-w-[200px]" title={user?.email}>{user?.email}</span>
                    <span className="text-xs text-slate-500 font-medium bg-white/50 px-2 py-0.5 rounded-full border border-slate-100 w-fit backdrop-blur-sm">个人账户</span>
                </div>
            </div>
            <Button 
                variant="ghost" 
                onClick={handleLogout}
                className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full px-4 h-11 border border-transparent hover:border-rose-100 transition-all"
            >
                <LogOut className="w-4 h-4 mr-2" />
                退出登录
            </Button>
        </header>

        {error && (
            <div className="bg-rose-50 border border-rose-100 text-rose-600 px-6 py-4 rounded-2xl flex items-center gap-3 shadow-sm animate-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium">{error}</p>
                <Button variant="link" onClick={() => window.location.reload()} className="ml-auto text-rose-700 font-bold">重试</Button>
            </div>
        )}

        {/* Bento Grid Layout */}
                <div className="space-y-6 lg:space-y-8">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
                        {/* 1. 资产卡片 (Wallet) */}
                        <div className="lg:col-span-4 flex flex-col">
                            <div className="flex-1 min-h-[300px] lg:min-h-[360px] relative overflow-hidden group rounded-3xl lg:rounded-[2.5rem] bg-[#1e1b4b] text-white shadow-xl lg:shadow-2xl shadow-indigo-900/20 transition-all duration-500 hover:shadow-indigo-900/40 hover:-translate-y-1">
                                {/* 动态背景层 */}
                                <div className="absolute inset-0 bg-gradient-to-br from-[#312e81] via-[#1e1b4b] to-black z-0"></div>
                                
                                {/* 极光效果 */}
                                <div className="absolute -top-24 -right-24 w-48 h-48 lg:w-64 lg:h-64 bg-indigo-500 rounded-full blur-[80px] lg:blur-[100px] opacity-40 group-hover:opacity-60 transition-opacity duration-700"></div>
                                <div className="absolute -bottom-24 -left-24 w-48 h-48 lg:w-64 lg:h-64 bg-violet-600 rounded-full blur-[80px] lg:blur-[100px] opacity-30 group-hover:opacity-50 transition-opacity duration-700"></div>
                                
                                {/* 噪点纹理叠加 */}
                                <div className="absolute inset-0 opacity-20 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay z-0 pointer-events-none"></div>

                                {/* 网格纹理 */}
                                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)] z-0 pointer-events-none"></div>

                                {/* 内容层 */}
                                <div className="relative z-10 p-6 lg:p-8 flex flex-col justify-between h-full">
                                    
                                    {/* 顶部：图标与操作 */}
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-lg shadow-black/20 group-hover:scale-110 transition-transform duration-300">
                                                <LambertCoin size={20} variant="gold" className="lg:w-6 lg:h-6 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs lg:text-sm font-medium text-indigo-200/80 tracking-wide">我的资产</span>
                                                <span className="text-base lg:text-lg font-bold text-white tracking-tight">朗伯币钱包</span>
                                            </div>
                                        </div>
                                        
                                        <Button 
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowTransactions(true)}
                                            className="bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/5 rounded-xl px-3 h-8 lg:px-4 lg:h-9 text-xs lg:text-sm backdrop-blur-sm transition-all group-hover:border-white/20"
                                        >
                                            <History className="w-3 h-3 lg:w-3.5 lg:h-3.5 mr-1.5 lg:mr-2 opacity-70" />
                                            交易明细
                                        </Button>
                                    </div>
                                    
                                    {/* 中部：余额展示 */}
                                    <div className="py-4 lg:py-6">
                                        <div className="flex items-end gap-2 mb-2 opacity-80">
                                            <span className="text-[10px] lg:text-xs font-bold text-indigo-300 uppercase tracking-[0.2em]">当前余额</span>
                                            <div className="h-px w-8 lg:w-12 bg-gradient-to-r from-indigo-500/50 to-transparent mb-1.5"></div>
                                        </div>
                                        <div className="relative">
                                            <h2 className="text-5xl lg:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-indigo-200 tracking-tighter tabular-nums leading-none drop-shadow-2xl break-all">
                                                {loading ? (
                                                    <span className="animate-pulse opacity-50">---</span>
                                                ) : (
                                                    wallet?.balance_permanent?.toLocaleString() ?? 0
                                                )}
                                            </h2>
                                            {/* 余额光晕 */}
                                            <div className="absolute -inset-4 bg-white/5 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                                        </div>
                                    </div>

                                    {/* 底部：状态与ID */}
                                    <div className="flex items-end justify-between mt-auto pt-4 lg:pt-6 border-t border-white/5">
                                        <div className="flex flex-col gap-0.5 lg:gap-1">
                                            <span className="text-[10px] uppercase text-indigo-300/60 font-bold tracking-wider">钱包 ID</span>
                                            <span className="font-mono text-[10px] lg:text-xs text-indigo-200/80 tracking-wider">
                                                {wallet?.id ? `**** ${wallet.id.slice(-4)}` : '****'}
                                            </span>
                                        </div>
                                        
                                        <div className="flex items-center gap-1.5 lg:gap-2 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 lg:px-3 lg:py-1.5 rounded-full backdrop-blur-md">
                                            <div className="relative flex h-1.5 w-1.5 lg:h-2 lg:w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 lg:h-2 lg:w-2 bg-emerald-500"></span>
                                            </div>
                                            <span className="text-[10px] lg:text-xs font-medium text-emerald-300">账户状态正常</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Banner */}
                        <div className="lg:col-span-8 flex flex-col">
                             <div className="flex-1 h-64 lg:h-auto min-h-[250px] rounded-3xl lg:rounded-[2.5rem] overflow-hidden shadow-lg lg:shadow-xl shadow-slate-200/50 border border-slate-100 bg-white relative group w-full">
                                 {/* 确保 Banner 填满高度 */}
                                 <div className="absolute inset-0 w-full h-full">
                                    <BannerCarousel className="h-full rounded-none border-0 shadow-none" />
                                 </div>
                                 {/* 悬浮时的光泽效果 */}
                                 <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-10"></div>
                             </div>
                        </div>
                    </div>

                    {/* 3. 充值中心 */}
                    <div className="rounded-3xl lg:rounded-[2.5rem] overflow-hidden shadow-xl lg:shadow-2xl shadow-slate-200/50 border border-slate-100 bg-white relative z-10">
                        {wallet && <RechargePanel appId={wallet.app_id} className="border-0 shadow-none rounded-none" />}
                    </div>
                </div>
      </div>

      <TransactionsDialog 
        open={showTransactions}
        onOpenChange={setShowTransactions}
        transactions={transactions}
        loading={transactionsLoading}
      />

      <RechargeSuccessDialog
        open={showSuccessDialog}
        onOpenChange={setShowSuccessDialog}
      />
    </div>
  );
}
