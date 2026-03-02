-- Migration: Update recharge products to new tiers
-- Description: Updates the recharge_products table with 6 new tiers as requested

-- 1. Clear existing products
TRUNCATE TABLE public.recharge_products;

-- 2. Insert new products
INSERT INTO public.recharge_products (name, amount, points, tag, description, button_text, is_active) VALUES
('新手体验', 1, 1, '新手体验・🧩', '到账：1 朗伯币', '立即体验', true),
('轻量入门', 5, 6, '轻量入门・☕', '到账：6 朗伯币', '特惠充值', true),
('人气爆款', 10, 12, '人气爆款・🔥', '到账：12 朗伯币', '立即抢购', true),
('进阶畅玩', 20, 25, '进阶畅玩・⚡', '到账：25 朗伯币', '推荐充值', true),
('尊享优选', 50, 65, '尊享优选・✨', '到账：65 朗伯币', '尊享充值', true),
('至尊专属', 100, 135, '至尊专属・👑', '到账：135 朗伯币', '立即开通', true);
