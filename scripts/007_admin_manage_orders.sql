-- 007_admin_manage_orders.sql
-- Grants admin users full control over the orders table while keeping existing member access

-- Insert permissions
DROP POLICY IF EXISTS "Admins can insert any orders" ON public.orders;
CREATE POLICY "Admins can insert any orders" ON public.orders
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Update permissions
DROP POLICY IF EXISTS "Admins can update any orders" ON public.orders;
CREATE POLICY "Admins can update any orders" ON public.orders
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Delete permissions
DROP POLICY IF EXISTS "Admins can delete any orders" ON public.orders;
CREATE POLICY "Admins can delete any orders" ON public.orders
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
