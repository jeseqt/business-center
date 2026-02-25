import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PlatformBanner } from '../types/shared';

const DEFAULT_BANNERS: PlatformBanner[] = [
  {
    id: '1',
    title: 'AI 助力商业化',
    description: '专注于利用AI实现产品化、场景化与商业化。快速转化为AI原生应用。',
    image_url: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=2000',
    link_url: '#',
    sort_order: 0,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: '2',
    title: '智能算力引擎',
    description: '高性能 GPU 集群，为您的 AI 模型训练提供强大动力。',
    image_url: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&q=80&w=2000',
    link_url: '#',
    sort_order: 1,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: '3',
    title: '企业级解决方案',
    description: '定制化私有部署，保障数据安全与业务连续性。',
    image_url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=2000',
    link_url: '#',
    sort_order: 2,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

export function BannerCarousel() {
  const [banners, setBanners] = useState<PlatformBanner[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    // Manual timeout mechanism using Promise.race
    let raceTimer: any;
    const controller = new AbortController();
    
    try {
      const fetchPromise = supabase
        .from('platform_banners')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .abortSignal(controller.signal);
      
      const timeoutPromise = new Promise((_, reject) => {
        raceTimer = setTimeout(() => {
            controller.abort();
            reject(new Error('Fetch timeout'));
        }, 5000);
      });

      // @ts-ignore
      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

      if (error) {
        console.warn('Error fetching banners (using default):', error);
        setBanners(DEFAULT_BANNERS);
      } else if (data && data.length > 0) {
        setBanners(data);
      } else {
        setBanners(DEFAULT_BANNERS);
      }
    } catch (err: any) {
      console.warn('Banner fetch timed out or failed (using default):', err);
      setBanners(DEFAULT_BANNERS);
    } finally {
      if (raceTimer) clearTimeout(raceTimer);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (banners.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [banners.length]);

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const handleImageError = (id: string) => {
    setImageError(prev => ({ ...prev, [id]: true }));
  };

  if (loading) {
    return (
      <div className="relative h-64 md:h-80 w-full overflow-hidden rounded-xl bg-slate-100 animate-pulse border border-slate-200 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (banners.length === 0) return null;

  const currentBanner = banners[currentIndex];
  const isImageError = imageError[currentBanner.id];

  return (
    <div className="relative h-64 md:h-80 w-full overflow-hidden rounded-xl group shadow-lg shadow-slate-200/50 border border-slate-100 bg-white">
      {/* Background Image */}
      <div className="absolute inset-0 w-full h-full bg-slate-900">
        {!isImageError ? (
          <img 
            src={currentBanner.image_url} 
            alt={currentBanner.title}
            onError={() => handleImageError(currentBanner.id)}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
           // Fallback gradient if image fails
           <div className="w-full h-full bg-gradient-to-br from-brand-600 to-indigo-800" />
        )}
        {/* Gradient Overlay - Lighter for light theme */}
        <div className={`absolute inset-0 ${isImageError ? 'bg-black/10' : 'bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-transparent'}`} />
      </div>

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col justify-center px-8 md:px-16 max-w-4xl">
        <div className="animate-fade-in-up">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 leading-tight tracking-tight drop-shadow-md">
            {currentBanner.title}
          </h2>
          <p className="text-slate-100 text-base md:text-lg mb-8 line-clamp-2 max-w-xl leading-relaxed drop-shadow-sm font-medium">
            {currentBanner.description}
          </p>
          
          {currentBanner.link_url && (
            <a 
              href={currentBanner.link_url}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-white text-brand-600 hover:bg-slate-50 rounded-lg font-semibold transition-all duration-300 shadow-lg shadow-black/10 group/btn"
            >
              了解更多
              <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
            </a>
          )}
        </div>
      </div>

      {/* Controls */}
      {banners.length > 1 && (
        <>
          <button 
            onClick={prevSlide}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 border border-white/20 shadow-lg"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button 
            onClick={nextSlide}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 border border-white/20 shadow-lg"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          
          {/* Indicators */}
          <div className="absolute bottom-6 left-8 flex gap-2">
            {banners.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 shadow-sm ${
                  idx === currentIndex 
                    ? 'w-8 bg-white' 
                    : 'w-2 bg-white/50 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
