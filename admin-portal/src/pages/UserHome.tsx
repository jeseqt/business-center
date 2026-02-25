import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { BannerCarousel } from '../components/BannerCarousel';
import { User, LogOut, Wallet, History } from 'lucide-react';
import { PlatformWallet, PlatformWalletTransaction } from '../types/shared';
import { Session } from '@supabase/supabase-js';

interface UserHomeProps {
  session: Session | null;
}

export default function UserHome({ session }: UserHomeProps) {
  const [user, setUser] = useState<any>(session?.user || null);
  const [platformUser, setPlatformUser] = useState<any>(null); // State for platform user
  const [wallet, setWallet] = useState<PlatformWallet | null>(null);
  const [transactions, setTransactions] = useState<PlatformWalletTransaction[]>([]);

  const [debugInfo, setDebugInfo] = useState<any>({}); // For fetch errors
  const [diagnosticInfo, setDiagnosticInfo] = useState<any>({}); // For system diagnostics
  const [showDebug, setShowDebug] = useState<boolean>(true);

  useEffect(() => {
    // Sync user state with session prop if it changes
    if (session?.user) {
      setUser(session.user);
    }
  }, [session]);

  // Fetch data useEffect
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const signal = controller.signal;

    const fetchData = async () => {
      // Timeout mechanism
      const timeoutId = setTimeout(() => {
        if (mounted) {
            console.warn('Fetch timed out, aborting...');
            controller.abort();
            setDebugInfo(prev => ({ ...prev, error: '请求超时 (15s)', stack: 'Network request timed out' }));
        }
      }, 15000);

      try {
        // Clear previous errors
        setDebugInfo({});
        setDebugInfo(prev => ({ ...prev, step: 'Starting fetch...' }));
        
        let currentUser = session?.user;
        
        setDebugInfo(prev => ({ ...prev, step: 'Checking user...' }));
        // Fallback: double check if prop is missing but client has session
        if (!currentUser) {
            const { data } = await supabase.auth.getSession();
            currentUser = data.session?.user;
        }

        if (!currentUser) {
            // Last resort: check server
            const { data: { user } } = await supabase.auth.getUser();
            currentUser = user || undefined;
        }

        if (!mounted) return;
        setUser(currentUser);
        
        if (currentUser) {
            setDebugInfo(prev => ({ ...prev, step: 'User found, checking token...' }));
            // Force refresh session to ensure RLS context is valid
            // Only if token is missing
            if (!session?.access_token) {
                setDebugInfo(prev => ({ ...prev, step: 'Refreshing session...' }));
                const { error: refreshError } = await supabase.auth.refreshSession();
                if (refreshError) {
                    console.error('Session refresh failed:', refreshError);
                    // Continue anyway, maybe the token is still valid
                }
            }

            if (!mounted) return;
            setDebugInfo(prev => ({ ...prev, step: 'Fetching platform_users (RPC)...' }));
            
            // Try RPC first (Fast Path)
            try {
                const { data: rpcData, error: rpcError } = await supabase.rpc('get_or_create_user_dashboard_data');
                
                if (!rpcError && rpcData) {
                    // RPC Success
                    // setDebugInfo(prev => ({ ...prev, step: 'RPC Success' }));
                    setPlatformUser(rpcData.platform_user);
                    setWallet(rpcData.wallet);
                    setTransactions(rpcData.transactions || []);
                    setDebugInfo(prev => ({ ...prev, step: 'Fetch complete (RPC)' }));
                    return; // Exit early
                } else {
                    console.warn('RPC failed or not found, falling back to REST:', rpcError);
                    setDebugInfo(prev => ({ ...prev, step: 'RPC failed, trying REST...' }));
                }
            } catch (rpcEx) {
                console.warn('RPC Exception:', rpcEx);
            }

            // Fallback to REST (Slow Path)
            setDebugInfo(prev => ({ ...prev, step: 'Fetching platform_users (REST)...' }));
            
            // Fetch platform user with abort signal
            let { data: pUser, error: platformError } = await supabase
                .from('platform_users')
                .select('id, app_id, external_user_id')
                .eq('external_user_id', currentUser.id)
                .abortSignal(signal)
                .maybeSingle();
            
            if (!mounted) return;

            // Auto-create platform_users record if missing
            if (!pUser && !platformError) {
                setDebugInfo(prev => ({ ...prev, step: 'Auto-creating platform_users...' }));
                console.log('Platform user missing, attempting to create...');
                try {
                // Try to get ANY active app first
                let { data: defaultApp } = await supabase
                    .from('platform_apps')
                    .select('id')
                    .eq('status', 'active') // Filter for active apps
                    .limit(1)
                    .abortSignal(signal)
                    .maybeSingle();

                // If no active app found, try to get ANY app (fallback)
                if (!defaultApp) {
                        console.warn('No active app found, trying any app...');
                        const { data: anyApp } = await supabase
                        .from('platform_apps')
                        .select('id')
                        .limit(1)
                        .abortSignal(signal)
                        .maybeSingle();
                        defaultApp = anyApp;
                }

                if (defaultApp) {
                    const { data: newUser, error: createError } = await supabase
                    .from('platform_users')
                    .insert([{ 
                        external_user_id: currentUser.id,
                        app_id: defaultApp.id
                    }])
                    .select('id, app_id, external_user_id')
                    .abortSignal(signal)
                    .single();
                    
                    if (createError) {
                    console.error('Failed to auto-create platform user:', createError);
                    platformError = createError;
                    } else {
                    pUser = newUser;
                    console.log('Successfully created platform user:', newUser);
                    }
                } else {
                    console.warn('No platform_apps found, cannot create user.');
                    platformError = { 
                    message: 'No platform_apps available to bind user.', 
                    details: '', 
                    hint: '', 
                    code: '404', 
                    name: 'NotFoundError' 
                    };
                }
                } catch (err) {
                console.error('Error in auto-creation logic:', err);
                }
            }

            if (!mounted) return;
            setPlatformUser(pUser); // Update platform user state
            setDebugInfo(prev => ({ ...prev, step: 'Platform user fetched' }));
            
            if (platformError) {
                setDebugInfo((prev: any) => ({ ...prev, platformError }));
            }

            if (pUser) {
                setDebugInfo(prev => ({ ...prev, step: 'Fetching wallet...' }));
                // Fetch wallet
                const { data: walletData, error: walletError } = await supabase
                .from('platform_wallets')
                .select('*')
                .eq('platform_user_id', pUser.id)
                .abortSignal(signal)
                .maybeSingle();

                if (!mounted) return;
                setWallet(walletData);
                if (walletError) setDebugInfo((prev: any) => ({ ...prev, walletError }));

                if (walletData) {
                setDebugInfo(prev => ({ ...prev, step: 'Fetching transactions...' }));
                // Fetch transactions
                const { data: txData, error: txError } = await supabase
                    .from('platform_wallet_transactions')
                    .select('*')
                    .eq('wallet_id', walletData.id)
                    .order('created_at', { ascending: false })
                    .limit(5)
                    .abortSignal(signal);
                
                if (!mounted) return;
                setTransactions(txData || []);
                if (txError) setDebugInfo((prev: any) => ({ ...prev, txError }));
                }
            }
        }
        setDebugInfo(prev => ({ ...prev, step: 'Fetch complete' }));
      } catch (err: any) {
        if (err.name === 'AbortError') {
           console.error('Fetch aborted due to timeout');
           // Handled in timeout callback
        } else {
           console.error('Fetch error:', err);
           setDebugInfo(prev => ({ ...prev, error: err.message, stack: err.stack }));
        }
      } finally {
        clearTimeout(timeoutId);
      }
    };

    if (session?.user) {
        // Small delay to allow auth state to settle
        const timer = setTimeout(fetchData, 100);
        return () => {
            clearTimeout(timer);
            mounted = false;
            controller.abort();
        };
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

        <div className="grid gap-6 md:grid-cols-12">
            {debugInfo.error && (
              <div className="md:col-span-12 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm backdrop-blur-sm">
                <p className="font-bold flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500"/> 数据加载失败</p>
                <p className="mt-1 opacity-80">
                  {debugInfo.error === 'Fetch timeout' || debugInfo.error === '请求超时 (15s)' 
                    ? '网络连接超时，请检查您的网络连接或稍后重试。' 
                    : `错误信息: ${debugInfo.error}`}
                </p>
                <p className="mt-1 text-xs opacity-50 font-mono">{debugInfo.stack}</p>
              </div>
            )}
            
            {!platformUser && user && !debugInfo.error && !debugInfo.platformError && (
            <div className="md:col-span-12 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 backdrop-blur-sm">
              <h3 className="font-bold flex items-center gap-2">
                ⚠️ 账号数据不完整
              </h3>
              <p className="mt-2 text-sm opacity-80">
                检测到您的账号在业务系统中缺失档案数据（platform_users）。系统尝试自动修复失败，请联系管理员。
              </p>
            </div>
          )}

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
                    {wallet?.balance_permanent?.toLocaleString() ?? 0}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">永久额度</div>
                </div>
                <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 hover:border-emerald-500/30 transition-colors group/card">
                  <div className="text-sm text-slate-500 font-medium mb-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                    临时积分
                  </div>
                  <div className="text-3xl font-bold text-slate-900 tracking-tight group-hover/card:text-emerald-600 transition-colors">
                    {wallet?.balance_temporary?.toLocaleString() ?? 0}
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
                {transactions.length > 0 ? (
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

      {/* Debug Panel */}
      {showDebug && (
        <div className="fixed bottom-0 right-0 w-96 max-h-screen overflow-y-auto bg-gray-900 text-white p-4 shadow-xl z-50 text-xs font-mono opacity-90">
            <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
                <h3 className="font-bold text-green-400">System Diagnostics</h3>
                <button onClick={() => setShowDebug(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="space-y-2">
                <div>
                    <span className="text-gray-500">Session User:</span>
                    <span className="ml-2 text-blue-300">{session?.user?.id || 'null'}</span>
                </div>
                <div>
                    <span className="text-gray-500">Access Token:</span>
                    <span className="ml-2 text-yellow-300 break-all">{session?.access_token ? 'Present' : 'Missing'}</span>
                </div>
                {debugInfo.step && (
                    <div>
                        <span className="text-gray-500">Current Step:</span>
                        <span className="ml-2 text-purple-300">{debugInfo.step}</span>
                    </div>
                )}
                <div className="border-t border-gray-700 pt-2">
                    <h4 className="font-bold text-gray-300 mb-1">Diagnostic Results:</h4>
                    <pre className="whitespace-pre-wrap text-gray-400">
                        {JSON.stringify(diagnosticInfo, null, 2)}
                    </pre>
                    {Object.keys(debugInfo).length > 0 && (
                        <>
                            <h4 className="font-bold text-red-300 mt-2 mb-1">Fetch Errors / Logs:</h4>
                            <pre className="whitespace-pre-wrap text-red-400">
                                {JSON.stringify(debugInfo, null, 2)}
                            </pre>
                        </>
                    )}
                </div>
                {diagnosticInfo.exception && (
                    <div className="text-red-400 bg-red-900/20 p-2 rounded mt-2">
                        EXCEPTION: {diagnosticInfo.exception}
                    </div>
                )}
            </div>
        </div>
      )}
  </div>
  );
}
