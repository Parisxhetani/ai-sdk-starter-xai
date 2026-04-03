ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS cash_available_all INTEGER;

UPDATE public.orders
SET cash_available_all = 0
WHERE cash_available_all IS NULL;

ALTER TABLE public.orders
ALTER COLUMN cash_available_all SET DEFAULT 0;

ALTER TABLE public.orders
ALTER COLUMN cash_available_all SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_cash_available_all_nonnegative'
  ) THEN
    ALTER TABLE public.orders
    ADD CONSTRAINT orders_cash_available_all_nonnegative CHECK (cash_available_all >= 0);
  END IF;
END $$;
