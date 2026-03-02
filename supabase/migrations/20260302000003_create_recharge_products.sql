-- Create recharge_products table
create table if not exists public.recharge_products (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  amount numeric not null check (amount > 0),
  currency text not null default 'USD',
  points integer not null check (points > 0),
  is_active boolean not null default true,
  bagelpay_product_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.recharge_products enable row level security;

-- Policies
create policy "Public read access" on public.recharge_products
  for select using (true);

create policy "Admin full access" on public.recharge_products
  for all using (
    exists (
      select 1 from public.platform_admin_profiles
      where id = auth.uid()
    )
  );

-- Insert default products
insert into public.recharge_products (name, description, amount, points) values
  ('基础包', '10 积分', 10, 10),
  ('标准包', '20 积分', 20, 20),
  ('高级包', '50 积分', 50, 50),
  ('企业包', '100 积分', 100, 100);

-- Trigger for updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger handle_recharge_products_updated_at
  before update on public.recharge_products
  for each row
  execute procedure public.handle_updated_at();
