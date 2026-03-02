-- Add new columns for UI customization
alter table public.recharge_products 
add column if not exists tag text,
add column if not exists button_text text;

-- Clear existing default products to avoid duplication/confusion
delete from public.recharge_products where name in ('基础包', '标准包', '高级包', '企业包');

-- Insert new product packages
insert into public.recharge_products (name, amount, points, tag, description, button_text, is_active) values
('新手体验', 10, 10, '新手体验・🧩', '轻量体验，随心使用', '立即充值', true),
('日常优选', 30, 34, '日常优选・☕', '多赠：4 朗伯币', '特惠充值', true),
('人气爆款', 100, 118, '人气爆款・🔥', '超高性价比', '立即抢购', true),
('进阶畅玩', 200, 245, '进阶畅玩・⚡', '多赠：45 朗伯币', '推荐充值', true),
('尊享特权', 500, 650, '尊享特权・✨', '多赠：150 朗伯币', '尊享充值', true),
('至尊专属', 1000, 1400, '至尊专属・👑', '尊享全部权益', '立即开通', true);
