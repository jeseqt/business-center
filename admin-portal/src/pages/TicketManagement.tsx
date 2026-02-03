import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { MessageSquare, Clock, CheckCircle, AlertCircle, Send, User, Tag, AlertTriangle } from 'lucide-react';

interface Ticket {
  id: string;
  app_id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
  contact_email?: string;
  external_user_id?: string;
  app_name?: string; // Joined manually or via query
}

interface TicketReply {
  id: string;
  sender_type: 'user' | 'admin';
  content: string;
  created_at: string;
  admin_id?: string;
}

export default function TicketManagement() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<TicketReply[]>([]);
  const [replyContent, setReplyContent] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Load tickets
  const loadTickets = async () => {
    setLoading(true);
    try {
      // First fetch tickets
      const { data: ticketsData, error: ticketError } = await supabase
        .from('platform_app_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (ticketError) throw ticketError;

      // Then fetch app names manually to avoid complex joins/types issues in quick MVP
      if (ticketsData) {
        const appIds = [...new Set(ticketsData.map(t => t.app_id))];
        const { data: appsData } = await supabase.from('platform_apps').select('id, name').in('id', appIds);
        
        const appMap = new Map(appsData?.map(a => [a.id, a.name]));
        
        const enrichedTickets = ticketsData.map(t => ({
          ...t,
          app_name: appMap.get(t.app_id) || '未知应用'
        }));
        
        setTickets(enrichedTickets);
      }
    } catch (err) {
      console.error('Load tickets failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  // Load replies when ticket selected
  useEffect(() => {
    if (selectedTicket) {
      loadReplies(selectedTicket.id);
    } else {
      setReplies([]);
    }
  }, [selectedTicket]);

  const loadReplies = async (ticketId: string) => {
    const { data, error } = await supabase
      .from('platform_app_ticket_replies')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    
    if (!error && data) {
      setReplies(data);
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyContent.trim()) return;
    
    setSendingReply(true);
    try {
      const { error } = await supabase
        .from('platform_app_ticket_replies')
        .insert({
          ticket_id: selectedTicket.id,
          sender_type: 'admin',
          content: replyContent,
          admin_id: (await supabase.auth.getUser()).data.user?.id
        });

      if (error) throw error;
      
      setReplyContent('');
      loadReplies(selectedTicket.id);
      
      // Auto update status to in_progress if open
      if (selectedTicket.status === 'open') {
        await updateStatus(selectedTicket.id, 'in_progress');
      }
    } catch (err: any) {
      alert('回复失败: ' + err.message);
    } finally {
      setSendingReply(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await supabase.from('platform_app_tickets').update({ status }).eq('id', id);
      setTickets(tickets.map(t => t.id === id ? { ...t, status } : t));
      if (selectedTicket?.id === id) {
        setSelectedTicket({ ...selectedTicket, status });
      }
    } catch (err) {
      console.error('Update status failed', err);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, any> = {
      open: { color: 'blue', text: '待处理' },
      in_progress: { color: 'yellow', text: '处理中' },
      resolved: { color: 'green', text: '已解决' },
      closed: { color: 'gray', text: '已关闭' }
    };
    const config = map[status] || map.open;
    return <Badge color={config.color}>{config.text}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const map: Record<string, any> = {
      high: { color: 'red', text: '高优先级' },
      normal: { color: 'blue', text: '普通' },
      low: { color: 'gray', text: '低优先级' }
    };
    const config = map[priority] || map.normal;
    return <Badge color={config.color}>{config.text}</Badge>;
  };

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col space-y-6">
      <PageHeader 
        title="工单系统" 
        description="处理来自各个应用的客户支持工单"
        icon={MessageSquare}
      />
      
      <div className="flex-1 flex gap-4 min-h-0">
        {/* List Panel */}
        <Card className={`flex flex-col border shadow-sm ${selectedTicket ? 'hidden md:flex md:w-1/3 md:flex-none' : 'flex-1'} p-0 overflow-hidden`}>
          <div className="p-4 border-b flex justify-between items-center bg-gray-50">
            <h2 className="font-medium text-gray-900 flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              工单列表
            </h2>
            <Button variant="ghost" size="sm" onClick={loadTickets}><Clock className="h-4 w-4" /></Button>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-gray-500">加载中...</div>
            ) : tickets.length === 0 ? (
              <div className="p-8 text-center text-gray-500">暂无工单</div>
            ) : (
              <div className="divide-y">
                {tickets.map(ticket => (
                  <div 
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                    className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${selectedTicket?.id === ticket.id ? 'bg-indigo-50 border-l-4 border-indigo-500' : 'border-l-4 border-transparent'}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className={`font-medium line-clamp-1 ${selectedTicket?.id === ticket.id ? 'text-indigo-900' : 'text-gray-900'}`}>{ticket.title}</span>
                      <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                        {new Date(ticket.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusBadge(ticket.status)}
                      {ticket.priority === 'high' && <AlertTriangle className="h-3 w-3 text-red-500" />}
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{ticket.app_name}</span>
                      <span>{ticket.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Detail Panel */}
        {selectedTicket ? (
          <Card className="flex-[2] flex flex-col border shadow-sm overflow-hidden p-0">
            {/* Header */}
            <div className="p-4 border-b bg-gray-50 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">{selectedTicket.title}</h2>
                <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                  <span className="flex items-center gap-1"><User className="h-3 w-3" /> {selectedTicket.external_user_id || 'Unknown User'}</span>
                  <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> {selectedTicket.category}</span>
                  {getStatusBadge(selectedTicket.status)}
                  {getPriorityBadge(selectedTicket.priority)}
                </div>
              </div>
              <div className="flex gap-2">
                {selectedTicket.status !== 'resolved' && selectedTicket.status !== 'closed' && (
                  <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50" onClick={() => updateStatus(selectedTicket.id, 'resolved')}>
                    <CheckCircle className="h-4 w-4 mr-1" /> 解决
                  </Button>
                )}
                {selectedTicket.status !== 'closed' && (
                  <Button size="sm" variant="outline" className="text-gray-600" onClick={() => updateStatus(selectedTicket.id, 'closed')}>
                    <AlertCircle className="h-4 w-4 mr-1" /> 关闭
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelectedTicket(null)} className="md:hidden">返回</Button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/50">
              {/* Original Issue */}
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center flex-none">
                  <User className="h-4 w-4 text-gray-500" />
                </div>
                <div className="flex-1">
                  <div className="bg-white p-4 rounded-lg border shadow-sm">
                    <p className="text-gray-800 whitespace-pre-wrap">{selectedTicket.description}</p>
                  </div>
                  <div className="mt-1 text-xs text-gray-400 pl-1">
                    {new Date(selectedTicket.created_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Replies */}
              {replies.map(reply => (
                <div key={reply.id} className={`flex gap-3 ${reply.sender_type === 'admin' ? 'flex-row-reverse' : ''}`}>
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-none ${reply.sender_type === 'admin' ? 'bg-indigo-100' : 'bg-gray-200'}`}>
                    {reply.sender_type === 'admin' ? <MessageSquare className="h-4 w-4 text-indigo-600" /> : <User className="h-4 w-4 text-gray-500" />}
                  </div>
                  <div className={`flex-1 max-w-[80%] ${reply.sender_type === 'admin' ? 'flex flex-col items-end' : ''}`}>
                    <div className={`p-3 rounded-lg border shadow-sm ${reply.sender_type === 'admin' ? 'bg-indigo-50 border-indigo-100' : 'bg-white'}`}>
                      <p className="text-gray-800 whitespace-pre-wrap">{reply.content}</p>
                    </div>
                    <div className="mt-1 text-xs text-gray-400 px-1">
                      {new Date(reply.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply Input */}
            <div className="p-4 border-t bg-white">
              <div className="flex gap-2">
                <textarea 
                  className="flex-1 p-2 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                  placeholder="输入回复内容..."
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                />
                <Button 
                  className="self-end" 
                  onClick={handleSendReply} 
                  disabled={sendingReply || !replyContent.trim()}
                >
                  {sendingReply ? '...' : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <div className="hidden md:flex flex-[2] items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>选择一个工单查看详情</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
