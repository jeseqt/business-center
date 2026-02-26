import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { BannerCarousel } from '../components/BannerCarousel';
import { User, LogOut, Wallet, History, Loader2 } from 'lucide-react';
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
      setTransactionsLoading(true);
      
      // Global timeout for the entire operation
      fetchTimeoutTimer = setTimeout(() => {
        if (mounted && loading) {
            console.warn('[UserHome] Global fetch timeout reached (15s)');
            setLoading(false);
            // Don't logout automatically, just stop loading
            // handleLogout(); 
            alert('数据加载超时，请检查网络连接或刷新页面重试');
        }
      }, 15000);

      const currentUser = session.user;
      
      try {
        // Wrapper for timeouts with detailed logging
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

        // 1. Fetch platform_users first (no join to avoid RLS/slow nested queries)
        console.log('[UserHome] Fetching user profile for:', currentUser.id);
        
        let { data: pUser, error: platformError } = await withTimeout(
            supabase
                .from('platform_users')
                .select('*')
                .eq('external_user_id', currentUser.id)
                .maybeSingle(),
            5000, 
            'Profile Fetch'
        );

        if (platformError) {
            console.error('[UserHome] platform_users fetch error:', platformError);
            throw platformError;
        }
        
        // 4. Auto-create if missing
        if (!pUser) {
            console.log('[UserHome] User not found, attempting auto-create...');
            
            // Get default app
            const { data: apps, error: appError } = await withTimeout(
                supabase
                    .from('platform_apps')
                    .select('id')
                    .eq('status', 'active')
                    .limit(1),
                3000,
                'App Lookup'
            );
            
            if (appError) {
                console.error('[UserHome] App Lookup failed:', appError);
                throw appError; // Treat as critical error
            }
            
            const defaultAppId = apps?.[0]?.id;
            
            if (defaultAppId) {
                const { data: newUser, error: createError } = await supabase
                    .from('platform_users')
                    .insert({
                        external_user_id: currentUser.id,
                        app_id: defaultAppId,
                        phone: currentUser.phone || null,
                        email: currentUser.email || null
                    })
                    .select()
                    .single();
                    
                if (createError) {
                    console.error('[UserHome] Auto-create failed:', createError);
                    throw createError; // Treat as critical error
                } else {
                    pUser = newUser;
                    console.log('[UserHome] Auto-create success:', newUser);
                }
            } else {
                console.warn('[UserHome] No active apps found for auto-create');
                throw new Error('No active apps found for auto-create');
            }
        }

        // 5. Process Wallet & Fetch Transactions
        if (pUser) {
            
            // Always fetch wallet explicitly to avoid nested-join RLS issues
            let walletData: any = null;
            try {
                 const { data: fetchedWallet } = await withTimeout(
                    supabase
                        .from('platform_wallets')
                        .select('*')
                        .eq('platform_user_id', pUser.id)
                        .maybeSingle(),
                    5000,
                    'Wallet Fetch'
                );
                if (fetchedWallet) walletData = fetchedWallet;
            } catch (walletError) {
                console.error('[UserHome] Wallet fetch failed:', walletError);
            }
            
            if (walletData) {
                if (mounted) setWallet(walletData);
                
                // Show profile/wallet immediately
                if (mounted) setLoading(false);
                
                // Fetch transactions immediately
                try {
                    const { data: txData } = await withTimeout(
                        supabase
                            .from('platform_wallet_transactions')
                            .select('*')
                            .eq('wallet_id', walletData.id)
                            .order('created_at', { ascending: false })
                            .limit(5),
                        5000,
                        'Transactions Fetch'
                    );
                        
                    if (txData && mounted) setTransactions(txData);
                } catch (txError) {
                    console.error('[UserHome] Transactions fetch failed (non-critical):', txError);
                } finally {
                    if (mounted) setTransactionsLoading(false);
                }
            } else {
                 // No wallet found even after fallback
                 if (mounted) setLoading(false);
                 if (mounted) setTransactionsLoading(false);
            }
        }

      } catch (err: any) {
        console.error('[UserHome] Critical error:', err);
        if (mounted) {
            // Don't logout on error, just stop loading and show error message
            setLoading(false);
            setTransactionsLoading(false);
            // alert(`数据加载失败: ${err.message || '未知错误'}`);
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
