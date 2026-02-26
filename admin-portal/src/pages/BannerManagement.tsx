import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { PlatformBanner } from '../types/shared';
import { Plus, Edit2, Trash2, ExternalLink, Image as ImageIcon, Upload, Loader2 } from 'lucide-react';

export default function BannerManagement() {
  const [banners, setBanners] = useState<PlatformBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentBanner, setCurrentBanner] = useState<Partial<PlatformBanner>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteBannerId, setDeleteBannerId] = useState<string | null>(null);

  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    try {
      const { data, error } = await supabase
        .from('platform_banners')
        .select('*')
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      setBanners(data || []);
    } catch (error) {
      console.error('Error fetching banners:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Basic validation
    if (!currentBanner.title?.trim()) {
      alert('请输入标题');
      return;
    }
    if (!currentBanner.image_url?.trim()) {
      alert('请上传图片或输入图片链接');
      return;
    }

    try {
      const bannerData = {
        title: currentBanner.title.trim(),
        description: currentBanner.description?.trim() || null,
        image_url: currentBanner.image_url.trim(),
        link_url: currentBanner.link_url?.trim() || null,
        sort_order: currentBanner.sort_order || 0,
        is_active: currentBanner.is_active ?? true,
        updated_at: new Date().toISOString(),
      };

      if (isEditing && currentBanner.id) {
        const { error } = await supabase
          .from('platform_banners')
          .update(bannerData)
          .eq('id', currentBanner.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('platform_banners')
          .insert([{ ...bannerData, created_at: new Date().toISOString() }]);
        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchBanners();
    } catch (error: any) {
      console.error('Error saving banner:', error);
      alert(`保存失败: ${error.message || '未知错误'}`);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteBannerId(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteBannerId) return;
    
    try {
      const { error } = await supabase
        .from('platform_banners')
        .delete()
        .eq('id', deleteBannerId);
        
      if (error) throw error;
      
      fetchBanners();
      setIsDeleteModalOpen(false);
      setDeleteBannerId(null);
    } catch (error) {
      console.error('Error deleting banner:', error);
      alert('删除失败，请重试');
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `${fileName}`;

      let { error: uploadError } = await supabase.storage
        .from('banner-images')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage
         .from('banner-images')
         .getPublicUrl(filePath);
      
      setCurrentBanner({ ...currentBanner, image_url: data.publicUrl });
    } catch (error: any) {
      alert('Error uploading image: ' + error.message);
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const openEditModal = (banner: PlatformBanner) => {
    setCurrentBanner(banner);
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setCurrentBanner({ sort_order: 0, is_active: true });
    setIsEditing(false);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">轮播图管理</h2>
          <p className="text-slate-500 mt-1">管理用户中心首页的轮播展示内容</p>
        </div>
        <Button onClick={openAddModal}>
          <Plus className="w-4 h-4 mr-2" />
          新增轮播图
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {banners.map((banner) => (
            <div key={banner.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden group hover:shadow-md transition-shadow">
              <div className="h-40 bg-slate-100 relative overflow-hidden group/image">
                {banner.image_url ? (
                  <img 
                    src={banner.image_url} 
                    alt={banner.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover/image:scale-105"
                    onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/400x200?text=No+Image')}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    <ImageIcon className="w-8 h-8" />
                  </div>
                )}
                <div className="absolute top-2 right-2 flex gap-2">
                  <span className={`px-2 py-1 text-xs font-bold rounded-md backdrop-blur-md ${banner.is_active ? 'bg-emerald-500/80 text-white' : 'bg-slate-500/80 text-white'}`}>
                      {banner.is_active ? '启用' : '禁用'}
                  </span>
                </div>
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-sm rounded text-xs text-white">
                  排序: {banner.sort_order}
                </div>
              </div>
              
              <div className="p-4 space-y-4">
                <div>
                  <h3 className="font-bold text-slate-900 line-clamp-1" title={banner.title}>{banner.title}</h3>
                  <p className="text-sm text-slate-500 line-clamp-2 mt-1 h-10" title={banner.description || ''}>
                    {banner.description || '暂无描述'}
                  </p>
                </div>
                
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => openEditModal(banner)}
                      className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="编辑"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(banner.id)}
                      className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {banner.link_url && (
                    <a 
                      href={banner.link_url} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    >
                      查看链接 <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
          {banners.length === 0 && (
            <div className="col-span-full py-10 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <p>暂无轮播图，点击右上角添加</p>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? '编辑轮播图' : '新增轮播图'}
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>取消</Button>
            <Button onClick={handleSave}>保存</Button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          <Input 
            label="标题"
            value={currentBanner.title || ''} 
            onChange={(e) => setCurrentBanner({...currentBanner, title: e.target.value})}
            placeholder="请输入标题"
          />
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
            <textarea 
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400"
              rows={3}
              value={currentBanner.description || ''}
              onChange={(e) => setCurrentBanner({...currentBanner, description: e.target.value})}
              placeholder="请输入简短描述"
            />
          </div>

          <div>
            <Input 
              label="图片链接"
              value={currentBanner.image_url || ''} 
              onChange={(e) => setCurrentBanner({...currentBanner, image_url: e.target.value})}
              placeholder="https://... 或点击下方上传"
            />
            
            <div className="mt-2">
              <label className={`flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {uploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                <span>{uploading ? '上传中...' : '上传本地图片'}</span>
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/*"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
              <p className="mt-1 text-xs text-slate-500">支持 JPG, PNG, GIF 等常见格式</p>
            </div>

            {currentBanner.image_url && (
              <div className="mt-2 h-32 w-full rounded-lg overflow-hidden border border-slate-200 bg-slate-50 relative group">
                <img 
                  src={currentBanner.image_url} 
                  className="w-full h-full object-cover" 
                  alt="Preview"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs bg-slate-100 -z-10">
                  预览区域
                </div>
              </div>
            )}
          </div>

          <Input 
            label="跳转链接 (可选)"
            value={currentBanner.link_url || ''} 
            onChange={(e) => setCurrentBanner({...currentBanner, link_url: e.target.value})}
            placeholder="https://..."
          />

          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="排序权重"
              type="number"
              value={currentBanner.sort_order ?? 0} 
              onChange={(e) => setCurrentBanner({...currentBanner, sort_order: parseInt(e.target.value) || 0})}
            />
            <div className="flex items-center pt-6">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  checked={currentBanner.is_active ?? true}
                  onChange={(e) => setCurrentBanner({...currentBanner, is_active: e.target.checked})}
                />
                <span className="text-sm font-medium text-slate-700">启用显示</span>
              </label>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="确认删除"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={confirmDelete}>确认删除</Button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          <p className="text-slate-600">确定要删除这个轮播图吗？此操作无法撤销。</p>
        </div>
      </Modal>
    </div>
  );
}
