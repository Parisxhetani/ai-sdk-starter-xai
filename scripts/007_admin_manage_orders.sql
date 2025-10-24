-- 007_admin_manage_orders.sql
-- Allow admins to manage all orders while keeping existing user policies

create policy if not exists "Admins can insert any orders" on public.orders
  for insert
  with check (
    auth.uid() = user_id
    or exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

create policy if not exists "Admins can update any orders" on public.orders
  for update
  using (
    auth.uid() = user_id
    or exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

create policy if not exists "Admins can delete any orders" on public.orders
  for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );
