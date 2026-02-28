import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import UserHome from './pages/UserHome';
import StressTest from './pages/StressTest';
import UserManagement from './pages/UserManagement';
import AppManagement from './pages/AppManagement';
import OrderManagement from './pages/OrderManagement';
import UsageReports from './pages/UsageReports';
import InviteManagement from './pages/InviteManagement';
import TicketManagement from './pages/TicketManagement';
import BannerManagement from './pages/BannerManagement';
import NotificationManagement from './pages/NotificationManagement';
import ConfigManagement from './pages/ConfigManagement';
import VersionManagement from './pages/VersionManagement';
import ProfileSettings from './pages/ProfileSettings';

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
        // Only clear if session is truly null (explicit sign out)
        if (!session) {
            localStorage.clear();
            sessionStorage.clear();
            setSession(null);
            setLoading(false);
            setIsAdmin(false);
            setDebugStatus('Signed out');
        } else {
            console.warn('SIGNED_OUT event received but session still exists?', session);
        }
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
        .maybeSingle()
        .abortSignal(controller.signal);
      
      clearTimeout(timeoutId as any);

      if (data && !error) {
        setIsAdmin(true);
        setDebugStatus('Admin role confirmed');
      } else {
        // Only set to false if we successfully queried but found no admin profile
        // or if it's the initial load.
        // If we are already logged in (loading=false) and just refreshing token,
        // a network error shouldn't kick us out immediately.
        if (loading || !error) {
           setIsAdmin(false);
           setDebugStatus('User role confirmed (or error during init)');
        } else {
           console.warn('Check admin role failed during session refresh, keeping previous state', error);
           setDebugStatus(`Role check warning: ${error.message}`);
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.warn('Check admin role timed out');
        setDebugStatus('Role check timed out');
      } else {
        console.error('Error checking admin role:', e);
        setDebugStatus(`Role check error: ${e.message}`);
      }
      
      // Only reset admin status on initial load or if explicitly failed
      if (loading) {
        setIsAdmin(false);
      }
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
        }>
          <Route index element={<Navigate to="users" replace />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="apps" element={<AppManagement />} />
          <Route path="orders" element={<OrderManagement />} />
          <Route path="reports" element={<UsageReports />} />
          <Route path="invites" element={<InviteManagement />} />
          <Route path="tickets" element={<TicketManagement />} />
          <Route path="banners" element={<BannerManagement />} />
          <Route path="notifications" element={<NotificationManagement />} />
          <Route path="configs" element={<ConfigManagement />} />
          <Route path="versions" element={<VersionManagement />} />
          <Route path="profile" element={<ProfileSettings />} />
        </Route>

        <Route path="/user" element={
          session ? (!isAdmin ? <UserHome session={session} /> : <Navigate to="/dashboard" replace />) : <Navigate to="/" replace />
        } />
        
        {/* Hidden Stress Test Route */}
        <Route path="/stress-test" element={<StressTest />} />

        {/* Catch all - redirect to root */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
