import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import UserHome from './pages/UserHome';
import StressTest from './pages/StressTest';
import UserManagement from './pages/UserManagement';
import AppManagement from './pages/AppManagement';
import ProductManagement from './pages/ProductManagement';
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
  const cachedAdmin = typeof window !== 'undefined' ? localStorage.getItem('bc:isAdmin') : null;
  const [isAdmin, setIsAdmin] = useState<boolean | null>(cachedAdmin === 'true' ? true : cachedAdmin === 'false' ? false : null);
  const [holdForAdmin, setHoldForAdmin] = useState<boolean>(cachedAdmin === 'true');
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
    
    const forceLoadTimer = setTimeout(() => {
      if (mounted) {
        console.warn('Force loading timeout reached');
        setLoading(false);
        setDebugStatus('Timeout reached, forcing load...');
      }
    }, 4000);

    const checkSSOToken = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const ssoToken = urlParams.get('sso_token');
      const ssoSign = urlParams.get('sso_sign');
      const timestamp = urlParams.get('timestamp');

      if (ssoToken && ssoSign && timestamp) {
        setDebugStatus('Verifying SSO parameters...');
        try {
          const { data, error } = await supabase.functions.invoke('sso-login', {
            body: { 
              sso_token: ssoToken,
              sso_sign: ssoSign,
              timestamp: timestamp,
              redirectTo: window.location.origin + window.location.pathname
            }
          });
          if (error) throw error;
          if (data?.action_link) {
            setDebugStatus('SSO verification successful, redirecting to login...');
            
            // Supabase backend will return the verify link which includes our correct redirect_to now
            // But we must also ensure that the redirect URL is fully encoded and recognized by Supabase
            // as an allowed redirect URL in the dashboard. If it's not allowed, Supabase will fall back to Site URL.
            
            // Just use the link returned by the server directly, as the server now overrides the redirect_to
            window.location.href = data.action_link;
            return true; // Indicating SSO is in progress
          }
        } catch (err: any) {
          console.error('SSO Login Error:', err);
          setDebugStatus(`SSO Error: ${err.message}`);
          // Remove the invalid token from URL to prevent loop
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
      return false;
    };

    const initSession = async () => {
      try {
        const ssoInProgress = await checkSSOToken();
        if (ssoInProgress) return; // Wait for redirect

        setDebugStatus('Checking session...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Session error:', error);
          throw error;
        }

        if (mounted) {
          setSession(session);
          if (session) {
            setDebugStatus(`User found (${session.user.email})`);
            if (holdForAdmin) {
              setLoading(true);
            } else {
              setLoading(false);
            }
            void checkAdminRole(session.user.id).catch((e) => {
              console.warn('Async role check failed:', e);
            });
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
          void checkAdminRole(session.user.id);
        }
      } else if (event === 'SIGNED_OUT') {
        console.log('User signed out, clearing state');
        if (!session) {
            localStorage.clear();
            sessionStorage.clear();
            localStorage.removeItem('bc:isAdmin');
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const { data, error } = await supabase
        .from('platform_admin_profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
        // .abortSignal(controller.signal);
      
      clearTimeout(timeoutId as any);

      if (data && !error) {
        setIsAdmin(true);
        localStorage.setItem('bc:isAdmin', 'true');
        setDebugStatus('Admin role confirmed');
      } else {
        if (loading || !error) {
           setIsAdmin(false);
           localStorage.setItem('bc:isAdmin', 'false');
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
      if (loading) {
        setIsAdmin(false);
        localStorage.setItem('bc:isAdmin', 'false');
      }
    } finally {
      if (holdForAdmin) {
        setHoldForAdmin(false);
        setLoading(false);
      }
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
          !session ? <Login /> : (
            isAdmin === true ? <Navigate to="/dashboard" replace /> :
            isAdmin === false ? <Navigate to="/user" replace /> :
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <div className="text-gray-500 text-sm font-medium">Verifying admin privileges...</div>
            </div>
          )
        } />
        
        <Route path="/dashboard" element={
          session ? (isAdmin ? <Dashboard /> : <Navigate to="/user" replace />) : <Navigate to="/" replace />
        }>
          <Route index element={<Navigate to="users" replace />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="apps" element={<AppManagement />} />
          <Route path="products" element={<ProductManagement />} />
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
