-- Recreate default payment methods without duplicates
-- Run once in Supabase SQL Editor after phase2 migration

SELECT public.seed_payment_methods_for_org('16294d42-04e7-4d08-8e09-3b44ce94a715');

-- Optional: verify
SELECT id, organization_id, code, name, type, sort_order, is_active
FROM public.payment_methods
WHERE organization_id = '16294d42-04e7-4d08-8e09-3b44ce94a715'
ORDER BY sort_order, name;
