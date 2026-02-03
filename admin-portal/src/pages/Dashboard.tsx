import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import UserManagement from './UserManagement';
import InviteManagement from './InviteManagement';
import AppManagement from './AppManagement';
import UsageReports from './UsageReports';
import { Users, Ticket, LogOut, LayoutDashboard, Menu, Layers, BarChart3 } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'users' | 'invites' | 'apps' | 'reports'>('apps');
  const [isSidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const navItems = [
    { id: 'apps', label: '应用接入管理', icon: Layers },
    { id: 'reports', label: '业务用量报表', icon: BarChart3 },
    { id: 'users', label: '用户与钱包', icon: Users },
    { id: 'invites', label: '邀请码管理', icon: Ticket },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b px-4 h-16 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!isSidebarOpen)}>
            <Menu className="h-5 w-5 text-gray-600" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-md">
              <LayoutDashboard className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 hidden sm:block">APP业务中台管理系统</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500 hidden sm:block">
            管理员
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            退出
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside 
          className={`bg-white border-r flex flex-col transition-all duration-300 ${
            isSidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full opacity-0 overflow-hidden'
          }`}
        >
          <nav className="p-4 space-y-1">
            <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              功能导航
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
                    isActive 
                      ? 'bg-indigo-50 text-indigo-700 shadow-sm' 
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          
          <div className="mt-auto p-4 border-t">
            <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-800">系统状态</h4>
              <p className="text-xs text-blue-600 mt-1">服务运行正常</p>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-4 sm:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {activeTab === 'users' && <UserManagement />}
            {activeTab === 'invites' && <InviteManagement />}
            {activeTab === 'apps' && <AppManagement />}
            {activeTab === 'reports' && <UsageReports />}
          </div>
        </main>
      </div>
    </div>
  );
}
