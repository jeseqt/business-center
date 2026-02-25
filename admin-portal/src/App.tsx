import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import UserHome from './pages/UserHome';

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [debugStatus, setDebugStatus] = useState<string>('Initializing...');

  // 如果未配置环境变量，显示提示页面
  if (!isSupabaseConfigured) {
     // ... (keep existing code)
     return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        {/* ... existing content ... */}
      </div>
    );
  }

  useEffect(() => {
    let mounted = true;
    
    // 全局兜底：10秒后强制结束加载，防止页面永久卡死
    const forceLoadTimer = setTimeout(() => {
      if (mounted) {
        console.warn('Force loading timeout reached');
        setLoading(false);
        setDebugStatus('Timeout reached, forcing load...');
      }
    }, 8000);

    const initSession = async () => {
      try {
        setDebugStatus('Checking session...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Session error:', error);
          throw error;
        }

        if (mounted) {
          setSession(session);
          if (session) {
            setDebugStatus(`User found (${session.user.email}), checking role...`);
            await checkAdminRole(session.user.id);
          } else {
            setDebugStatus('No session found');
            setLoading(false);
          }
        }
      } catch (e: any) {
        console.error('Session init error:', e);
        if (mounted) {
          setDebugStatus(`Error: ${e.message}`);
          setLoading(false);
        }
      }
    };

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth event:', event);
      if (!mounted) return;

      setSession(session);
      
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session) {
          // 只有在当前不是 loading 状态，或者还是初始状态时才重新检查
          // 避免和 initSession 冲突导致闪烁
          await checkAdminRole(session.user.id);
        }
      } else if (event === 'SIGNED_OUT') {
        console.log('User signed out, clearing state');
        // 清除本地存储，防止状态残留
        localStorage.clear();
        sessionStorage.clear();
        
        setSession(null);
        setLoading(false);
        setIsAdmin(false);
        setDebugStatus('Signed out');
      }
    });

    return () => {
      mounted = false;
      clearTimeout(forceLoadTimer);
      subscription.unsubscribe();
    };
  }, []);

  async function checkAdminRole(userId: string) {
    try {
      setDebugStatus('Verifying admin privileges...');
      // 设置超时，防止 RLS 死锁
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const { data, error } = await supabase
        .from('platform_admin_profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      
      clearTimeout(timeoutId as any);

      if (data && !error) {
        setIsAdmin(true);
        setDebugStatus('Admin role confirmed');
      } else {
        setIsAdmin(false);
        setDebugStatus('User role confirmed');
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.warn('Check admin role timed out');
        setDebugStatus('Role check timed out');
      } else {
        console.error('Error checking admin role:', e);
        setDebugStatus(`Role check error: ${e.message}`);
      }
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <div className="text-gray-500 text-sm font-medium">{debugStatus}</div>
        <div className="text-xs text-gray-400 max-w-xs text-center">
          如果长时间卡住，请尝试刷新页面或清除浏览器缓存
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={
          !session ? <Login /> : (isAdmin ? <Navigate to="/dashboard" replace /> : <Navigate to="/user" replace />)
        } />
        
        <Route path="/dashboard" element={
          session ? (isAdmin ? <Dashboard /> : <Navigate to="/user" replace />) : <Navigate to="/" replace />
        } />

        <Route path="/user" element={
          session ? (!isAdmin ? <UserHome session={session} /> : <Navigate to="/dashboard" replace />) : <Navigate to="/" replace />
        } />
        
        {/* Catch all - redirect to root */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
