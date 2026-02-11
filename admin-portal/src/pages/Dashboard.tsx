import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import UserManagement from './UserManagement';
import OrderManagement from './OrderManagement';
import InviteManagement from './InviteManagement';
import AppManagement from './AppManagement';
import UsageReports from './UsageReports';
import ConfigManagement from './ConfigManagement';
import VersionManagement from './VersionManagement';
import NotificationManagement from './NotificationManagement';
import TicketManagement from './TicketManagement';
import ProfileSettings from './ProfileSettings';
import { 
  Users, CreditCard, Ticket, LogOut, LayoutDashboard, 
  Menu, Layers, BarChart3, Settings, GitBranch, 
  Bell, MessageSquare, ChevronRight, Search,
  ChevronLeft, ChevronRight as ChevronRightIcon
} from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'users' | 'orders' | 'invites' | 'apps' | 'reports' | 'configs' | 'versions' | 'notifications' | 'tickets' | 'profile'>('users');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    getUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const navItems = [
    { id: 'users', label: '用户管理', icon: Users },
    { id: 'apps', label: '应用接入管理', icon: Layers },
    { id: 'orders', label: '财务订单流水', icon: CreditCard },
    { id: 'reports', label: '业务用量报表', icon: BarChart3 },
    { id: 'invites', label: '邀请码管理', icon: Ticket },
    { id: 'tickets', label: '工单系统', icon: MessageSquare },
    { id: 'notifications', label: '通知中心', icon: Bell },
    { id: 'configs', label: '统一配置中心', icon: Settings },
    { id: 'versions', label: '版本发布管理', icon: GitBranch },
  ] as const;

  const activeItem = navItems.find(item => item.id === activeTab);

  const handleGlobalSearch = () => {
    if (!searchQuery.trim()) return;
    
    const query = searchQuery.toLowerCase();
    const found = navItems.find(item => 
      item.label.includes(query) || 
      item.id.includes(query)
    );

    if (found) {
      setActiveTab(found.id);
      setSearchQuery('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      {/* Mobile Sidebar Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed lg:sticky top-0 left-0 z-50 h-screen bg-slate-900 text-white flex flex-col
          transition-all duration-300 ease-in-out shadow-2xl lg:shadow-none
          ${isCollapsed ? 'lg:w-20' : 'lg:w-72'} w-72
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Brand */}
        <div className={`h-16 flex items-center ${isCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} border-b border-slate-800/50 transition-all duration-300`}>
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          
          <span className={`font-bold text-sm tracking-tight whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 overflow-hidden hidden' : 'w-auto opacity-100'}`}>
            APP业务中台管理系统
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-6 px-3 space-y-1 custom-scrollbar">
          <div className={`px-3 mb-2 text-xs font-bold text-slate-500 uppercase tracking-wider transition-all duration-300 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>
            平台管理
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative
                  ${isActive 
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/20 font-medium' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }
                  ${isCollapsed ? 'justify-center' : ''}
                `}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                <span className={`whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 overflow-hidden hidden' : 'w-auto opacity-100'}`}>
                  {item.label}
                </span>
                {isActive && !isCollapsed && (
                  <div className="ml-auto">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/50" />
                  </div>
                )}
                
                {/* Tooltip for collapsed state */}
                {isCollapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                    {item.label}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Profile / Footer */}
        <div className="p-4 border-t border-slate-800/50 bg-slate-900/50">
          <div 
            className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer group ${activeTab === 'profile' ? 'bg-slate-800' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold shadow-lg flex-shrink-0">
              {currentUser?.email?.[0].toUpperCase() || 'A'}
            </div>
            <div className={`overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>
              <p className="text-sm font-medium text-white truncate">
                {currentUser?.email?.split('@')[0] || '管理员'}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {currentUser?.email || 'admin@example.com'}
              </p>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={(e) => {
                e.stopPropagation();
                handleLogout();
              }}
              className={`text-slate-400 hover:text-white hover:bg-slate-700 ${isCollapsed ? 'hidden' : 'ml-auto flex'}`}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        {/* Top Header */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-30 px-4 sm:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100"
            >
              <Menu className="h-6 w-6" />
            </button>
            
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="hidden sm:inline">控制台</span>
              <ChevronRight className="h-4 w-4" />
              <span className="font-medium text-slate-900">
                {activeTab === 'profile' ? '个人设置' : activeItem?.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="搜索菜单 (Enter跳转)..." 
                className="pl-9 pr-4 py-2 bg-slate-100 border-transparent focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-100 rounded-lg text-sm w-64 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGlobalSearch()}
              />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-4 sm:p-8 overflow-x-hidden">
          <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {activeTab === 'profile' ? '个人设置' : activeItem?.label}
                </h1>
                <p className="text-slate-500 mt-1">
                  {activeTab === 'profile' ? '管理您的个人信息和安全设置' : `管理您的${activeItem?.label}及相关配置`}
                </p>
              </div>
              <div className="flex gap-3">
                {/* Global Actions could go here */}
              </div>
            </div>

            {/* Content Container */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 min-h-[500px]">
              {activeTab === 'users' && <UserManagement />}
              {activeTab === 'orders' && <OrderManagement />}
              {activeTab === 'invites' && <InviteManagement />}
              {activeTab === 'apps' && <AppManagement />}
              {activeTab === 'reports' && <UsageReports />}
              {activeTab === 'configs' && <ConfigManagement />}
              {activeTab === 'versions' && <VersionManagement />}
              {activeTab === 'notifications' && <NotificationManagement />}
              {activeTab === 'tickets' && <TicketManagement />}
              {activeTab === 'profile' && <ProfileSettings />}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
