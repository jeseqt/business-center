import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, Check, X, Package } from 'lucide-react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Input } from '../components/Input';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';

interface Product {
  id: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  points: number;
  bagelpay_product_id: string | null;
  is_active: boolean;
  created_at: string;
}

export default function ProductManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    amount: 10,
    points: 10,
    bagelpay_product_id: '',
    is_active: true
  });

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('recharge_products')
        .select('*')
        .order('amount', { ascending: true });
      
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        amount: formData.amount,
        points: formData.points,
        bagelpay_product_id: formData.bagelpay_product_id || null,
        is_active: formData.is_active
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('recharge_products')
          .update(payload)
          .eq('id', editingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('recharge_products')
          .insert(payload);
        if (error) throw error;
      }

      setIsModalOpen(false);
      setEditingProduct(null);
      resetForm();
      fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      alert('Failed to save product');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    try {
      const { error } = await supabase
        .from('recharge_products')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      amount: 10,
      points: 10,
      bagelpay_product_id: '',
      is_active: true
    });
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      amount: product.amount,
      points: product.points,
      bagelpay_product_id: product.bagelpay_product_id || '',
      is_active: product.is_active
    });
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="充值商品管理" 
        description="管理用户充值套餐和 BagelPay 产品关联"
        action={
          <Button onClick={() => {
            setEditingProduct(null);
            resetForm();
            setIsModalOpen(true);
          }}>
            <Plus className="w-4 h-4 mr-2" />
            添加商品
          </Button>
        }
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b">
              <tr>
                <th className="px-6 py-3">名称/描述</th>
                <th className="px-6 py-3">金额 (USD)</th>
                <th className="px-6 py-3">积分</th>
                <th className="px-6 py-3">BagelPay ID</th>
                <th className="px-6 py-3">状态</th>
                <th className="px-6 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    加载中...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    暂无商品
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{product.name}</div>
                      <div className="text-slate-500 text-xs truncate max-w-[200px]">{product.description}</div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900">
                      ${product.amount}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {product.points}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">
                      {product.bagelpay_product_id || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={product.is_active ? 'success' : 'secondary'}>
                        {product.is_active ? '上架中' : '已下架'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button 
                        onClick={() => openEditModal(product)}
                        className="text-slate-400 hover:text-brand-600 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(product.id)}
                        className="text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProduct ? '编辑商品' : '添加商品'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="商品名称"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            required
            placeholder="例如：基础积分包"
          />
          
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">描述</label>
            <textarea
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="商品描述..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="金额 (USD)"
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value)})}
              required
            />
            <Input
              label="对应积分"
              type="number"
              value={formData.points}
              onChange={(e) => setFormData({...formData, points: parseInt(e.target.value)})}
              required
            />
          </div>

          <Input
            label="BagelPay Product ID (可选)"
            value={formData.bagelpay_product_id}
            onChange={(e) => setFormData({...formData, bagelpay_product_id: e.target.value})}
            placeholder="如果在 BagelPay 后台已创建产品，请填入 ID"
          />

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-slate-700">
              上架销售
            </label>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} type="button">
              取消
            </Button>
            <Button type="submit">
              {editingProduct ? '保存修改' : '立即创建'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
