-- PHASE 2 (v2.1): CRM + mixed payments + customer debts + n8n-ready data layer

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS email VARCHAR(255);

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');

ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- -----------------------------------------------------------------------------
-- 0) AUTH HARDENING: profile auto-creation and safer onboarding
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id, email, full_name)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Users can insert own profile'
  ) THEN
    CREATE POLICY "Users can insert own profile" ON profiles
      FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_user_organization()
RETURNS UUID AS $$
DECLARE
  current_uid UUID;
  current_org UUID;
  current_email TEXT;
  org_name TEXT;
BEGIN
  current_uid := auth.uid();

  IF current_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Ensure profile exists
  SELECT email INTO current_email
  FROM auth.users
  WHERE id = current_uid;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (current_uid, COALESCE(current_email, 'unknown@example.com'), 'Пользователь')
  ON CONFLICT (id) DO NOTHING;

  SELECT organization_id INTO current_org
  FROM public.organization_users
  WHERE user_id = current_uid
  ORDER BY created_at ASC
  LIMIT 1;

  IF current_org IS NOT NULL THEN
    RETURN current_org;
  END IF;

  org_name := COALESCE('Организация ' || split_part(current_email, '@', 1), 'Моя организация');

  INSERT INTO public.organizations (name)
  VALUES (org_name)
  RETURNING id INTO current_org;

  INSERT INTO public.organization_users (organization_id, user_id, role)
  VALUES (current_org, current_uid, 'admin')
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  RETURN current_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.ensure_user_organization() TO authenticated;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- 1) CUSTOMERS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  birthday DATE,
  gender VARCHAR(20) CHECK (gender IN ('male', 'female', 'other')),
  source VARCHAR(100),
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_org_phone_unique
  ON customers(organization_id, phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(full_name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 2) PAYMENT METHODS + sale payments
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'other' CHECK (type IN ('cash', 'card', 'bank_transfer', 'digital_wallet', 'other')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_org ON payment_methods(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON payment_methods(is_active);

DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON payment_methods;
CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.seed_payment_methods_for_org(org_id UUID)
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.payment_methods
  WHERE organization_id = org_id
    AND code IN ('cash', 'card', 'bank_transfer', 'click', 'payme');

  INSERT INTO public.payment_methods (organization_id, code, name, type, sort_order)
  VALUES
    (org_id, 'cash', 'Наличные', 'cash', 10),
    (org_id, 'card', 'Карта', 'card', 20),
    (org_id, 'bank_transfer', 'Банковский перевод', 'bank_transfer', 30),
    (org_id, 'click', 'Click', 'digital_wallet', 40),
    (org_id, 'payme', 'Payme', 'digital_wallet', 50);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.seed_payment_methods_after_org_create()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.seed_payment_methods_for_org(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_organization_created_seed_payment_methods ON organizations;
CREATE TRIGGER on_organization_created_seed_payment_methods
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_payment_methods_after_org_create();

DO $$
DECLARE
  org_record RECORD;
BEGIN
  FOR org_record IN SELECT id FROM organizations LOOP
    PERFORM public.seed_payment_methods_for_org(org_record.id);
  END LOOP;
END $$;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);

CREATE TABLE IF NOT EXISTS sale_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'UZS' CHECK (currency IN ('UZS', 'USD')),
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_org ON sale_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_tx ON sale_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_method ON sale_payments(payment_method_id);

-- -----------------------------------------------------------------------------
-- 3) CUSTOMER DEBTS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customer_debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  transaction_id UUID UNIQUE REFERENCES transactions(id) ON DELETE SET NULL,
  original_amount DECIMAL(12, 2) NOT NULL CHECK (original_amount > 0),
  paid_amount DECIMAL(12, 2) NOT NULL DEFAULT 0
    CONSTRAINT customer_debts_paid_non_negative_check CHECK (paid_amount >= 0),
  outstanding_amount DECIMAL(12, 2) GENERATED ALWAYS AS (original_amount - paid_amount) STORED,
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partially_paid', 'closed', 'cancelled')),
  due_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT customer_debts_paid_le_original_check CHECK (paid_amount <= original_amount)
);

CREATE INDEX IF NOT EXISTS idx_customer_debts_org ON customer_debts(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_debts_customer ON customer_debts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_debts_status ON customer_debts(status);

DROP TRIGGER IF EXISTS update_customer_debts_updated_at ON customer_debts;
CREATE TRIGGER update_customer_debts_updated_at BEFORE UPDATE ON customer_debts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS debt_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  debt_id UUID NOT NULL REFERENCES customer_debts(id) ON DELETE CASCADE,
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'UZS' CHECK (currency IN ('UZS', 'USD')),
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debt_payments_org ON debt_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON debt_payments(debt_id);

CREATE TABLE IF NOT EXISTS integration_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  endpoint VARCHAR(120) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  request_body JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_body JSONB NOT NULL DEFAULT '{}'::jsonb,
  status_code INTEGER NOT NULL DEFAULT 200,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, endpoint, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_integration_requests_org ON integration_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_integration_requests_endpoint ON integration_requests(endpoint);

CREATE OR REPLACE FUNCTION public.refresh_customer_debt_status(target_debt_id UUID)
RETURNS VOID AS $$
DECLARE
  total_paid DECIMAL(12, 2);
  total_amount DECIMAL(12, 2);
  new_status VARCHAR(30);
BEGIN
  SELECT original_amount INTO total_amount
  FROM customer_debts
  WHERE id = target_debt_id;

  IF total_amount IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM debt_payments
  WHERE debt_id = target_debt_id;

  IF total_paid <= 0 THEN
    new_status := 'open';
  ELSIF total_paid >= total_amount THEN
    new_status := 'closed';
    total_paid := total_amount;
  ELSE
    new_status := 'partially_paid';
  END IF;

  UPDATE customer_debts
  SET paid_amount = total_paid,
      status = new_status,
      updated_at = NOW()
  WHERE id = target_debt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.on_debt_payments_change_refresh_debt()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.refresh_customer_debt_status(COALESCE(NEW.debt_id, OLD.debt_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_refresh_customer_debt_status_on_payment ON debt_payments;
CREATE TRIGGER trigger_refresh_customer_debt_status_on_payment
  AFTER INSERT OR UPDATE OR DELETE ON debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.on_debt_payments_change_refresh_debt();

CREATE OR REPLACE FUNCTION public.create_sale_with_payments(
  org_id UUID,
  user_id_param UUID,
  location_id_param UUID,
  customer_id_param UUID DEFAULT NULL,
  items JSONB DEFAULT '[]'::jsonb,
  payments JSONB DEFAULT '[]'::jsonb,
  notes_param TEXT DEFAULT NULL,
  due_date_param DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  item JSONB;
  payment JSONB;
  product_row RECORD;
  method_exists BOOLEAN;
  available_qty DECIMAL(12, 2);
  requested_by_product JSONB := '{}'::jsonb;
  requested_for_product DECIMAL(12, 2);
  item_qty DECIMAL(12, 2);
  item_price DECIMAL(12, 2);
  item_total DECIMAL(12, 2);
  payment_amount DECIMAL(12, 2);
  tx_id UUID;
  debt_id UUID;
  total_amount DECIMAL(12, 2) := 0;
  total_paid DECIMAL(12, 2) := 0;
  outstanding DECIMAL(12, 2) := 0;
  first_currency VARCHAR(3);
  item_index INTEGER := 0;
BEGIN
  IF org_id IS NULL OR user_id_param IS NULL OR location_id_param IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing required parameters');
  END IF;

  IF jsonb_typeof(items) <> 'array' OR jsonb_array_length(items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sale items are required');
  END IF;

  -- Enforce org membership for authenticated users
  IF auth.role() = 'authenticated' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM organization_users
      WHERE organization_id = org_id
        AND user_id = auth.uid()
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Access denied for organization');
    END IF;
  END IF;

  IF customer_id_param IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM customers
      WHERE id = customer_id_param
        AND organization_id = org_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Customer not found in organization');
    END IF;
  END IF;

  -- Pass 1: validate items and inventory, compute total
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    item_index := item_index + 1;

    IF NOT (item ? 'product_id') OR NOT (item ? 'quantity') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Each item must include product_id and quantity');
    END IF;

    item_qty := (item->>'quantity')::DECIMAL(12, 2);
    IF item_qty IS NULL OR item_qty <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Item quantity must be greater than zero');
    END IF;

    SELECT id, sale_price, currency, name
    INTO product_row
    FROM products
    WHERE id = (item->>'product_id')::UUID
      AND organization_id = org_id
      AND is_active = true;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Product not found or inactive');
    END IF;

    IF item_index = 1 THEN
      first_currency := product_row.currency;
    ELSIF first_currency <> product_row.currency THEN
      RETURN jsonb_build_object('success', false, 'error', 'Mixed product currencies are not supported in one sale');
    END IF;

    IF item ? 'price' THEN
      item_price := (item->>'price')::DECIMAL(12, 2);
    ELSE
      item_price := product_row.sale_price;
    END IF;

    IF item_price IS NULL OR item_price < 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Item price must be zero or positive');
    END IF;

    item_total := item_qty * item_price;
    total_amount := total_amount + item_total;

    requested_for_product := COALESCE((requested_by_product ->> (product_row.id::TEXT))::DECIMAL(12, 2), 0) + item_qty;
    requested_by_product := jsonb_set(
      requested_by_product,
      ARRAY[product_row.id::TEXT],
      to_jsonb(requested_for_product),
      true
    );

    SELECT quantity
    INTO available_qty
    FROM inventory
    WHERE organization_id = org_id
      AND product_id = product_row.id
      AND location_id = location_id_param
    FOR UPDATE;

    IF available_qty IS NULL OR available_qty < requested_for_product THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Insufficient stock',
        'product_id', product_row.id,
        'product_name', product_row.name,
        'available_quantity', COALESCE(available_qty, 0),
        'requested_quantity', requested_for_product
      );
    END IF;
  END LOOP;

  -- Validate and sum payments
  IF jsonb_typeof(payments) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payments must be an array');
  END IF;

  FOR payment IN SELECT * FROM jsonb_array_elements(payments)
  LOOP
    IF NOT (payment ? 'payment_method_id') OR NOT (payment ? 'amount') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Each payment must include payment_method_id and amount');
    END IF;

    payment_amount := (payment->>'amount')::DECIMAL(12, 2);
    IF payment_amount IS NULL OR payment_amount <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be greater than zero');
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM payment_methods
      WHERE id = (payment->>'payment_method_id')::UUID
        AND organization_id = org_id
        AND is_active = true
    ) INTO method_exists;

    IF method_exists = false THEN
      RETURN jsonb_build_object('success', false, 'error', 'Payment method not found or inactive');
    END IF;

    total_paid := total_paid + payment_amount;
  END LOOP;

  IF total_paid > total_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Paid amount cannot exceed sale total');
  END IF;

  outstanding := total_amount - total_paid;

  IF outstanding > 0 AND customer_id_param IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Customer is required when payment is not full');
  END IF;

  INSERT INTO transactions (
    organization_id,
    type,
    from_location_id,
    user_id,
    customer_id,
    total_amount,
    currency,
    notes,
    metadata
  )
  VALUES (
    org_id,
    'sale',
    location_id_param,
    user_id_param,
    customer_id_param,
    total_amount,
    COALESCE(first_currency, 'UZS'),
    notes_param,
    jsonb_build_object(
      'payments_total', total_paid,
      'outstanding_amount', outstanding,
      'has_debt', outstanding > 0
    )
  )
  RETURNING id INTO tx_id;

  -- Pass 2: write items and decrement inventory
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    SELECT id, sale_price, currency
    INTO product_row
    FROM products
    WHERE id = (item->>'product_id')::UUID
      AND organization_id = org_id;

    item_qty := (item->>'quantity')::DECIMAL(12, 2);

    IF item ? 'price' THEN
      item_price := (item->>'price')::DECIMAL(12, 2);
    ELSE
      item_price := product_row.sale_price;
    END IF;

    item_total := item_qty * item_price;

    INSERT INTO transaction_items (
      transaction_id,
      product_id,
      quantity,
      price,
      currency,
      total
    )
    VALUES (
      tx_id,
      product_row.id,
      item_qty,
      item_price,
      product_row.currency,
      item_total
    );

    UPDATE inventory
    SET quantity = quantity - item_qty,
        updated_at = NOW()
    WHERE organization_id = org_id
      AND product_id = product_row.id
      AND location_id = location_id_param;
  END LOOP;

  FOR payment IN SELECT * FROM jsonb_array_elements(payments)
  LOOP
    payment_amount := (payment->>'amount')::DECIMAL(12, 2);

    INSERT INTO sale_payments (
      organization_id,
      transaction_id,
      payment_method_id,
      amount,
      currency,
      user_id,
      notes
    )
    VALUES (
      org_id,
      tx_id,
      (payment->>'payment_method_id')::UUID,
      payment_amount,
      COALESCE(first_currency, 'UZS'),
      user_id_param,
      payment->>'notes'
    );
  END LOOP;

  IF outstanding > 0 THEN
    INSERT INTO customer_debts (
      organization_id,
      customer_id,
      transaction_id,
      original_amount,
      due_date,
      notes
    )
    VALUES (
      org_id,
      customer_id_param,
      tx_id,
      outstanding,
      due_date_param,
      'Debt from sale transaction'
    )
    RETURNING id INTO debt_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', tx_id,
    'total_amount', total_amount,
    'total_paid', total_paid,
    'outstanding_amount', outstanding,
    'debt_id', debt_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_sale_with_payments(
  UUID,
  UUID,
  UUID,
  UUID,
  JSONB,
  JSONB,
  TEXT,
  DATE
) TO authenticated;

CREATE OR REPLACE FUNCTION public.pay_customer_debt(
  org_id UUID,
  user_id_param UUID,
  debt_id_param UUID,
  payment_method_id_param UUID,
  amount_param DECIMAL(12, 2),
  notes_param TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  debt_row RECORD;
BEGIN
  IF amount_param IS NULL OR amount_param <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be greater than zero');
  END IF;

  IF auth.role() = 'authenticated' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM organization_users
      WHERE organization_id = org_id
        AND user_id = auth.uid()
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Access denied for organization');
    END IF;
  END IF;

  SELECT *
  INTO debt_row
  FROM customer_debts
  WHERE id = debt_id_param
    AND organization_id = org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debt not found');
  END IF;

  IF debt_row.status = 'closed' OR debt_row.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debt is already closed or cancelled');
  END IF;

  IF amount_param > debt_row.outstanding_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment amount exceeds outstanding debt');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM payment_methods
    WHERE id = payment_method_id_param
      AND organization_id = org_id
      AND is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment method not found or inactive');
  END IF;

  INSERT INTO debt_payments (
    organization_id,
    debt_id,
    payment_method_id,
    amount,
    currency,
    user_id,
    notes
  )
  VALUES (
    org_id,
    debt_id_param,
    payment_method_id_param,
    amount_param,
    'UZS',
    user_id_param,
    notes_param
  );

  PERFORM public.refresh_customer_debt_status(debt_id_param);

  RETURN (
    SELECT jsonb_build_object(
      'success', true,
      'debt_id', d.id,
      'status', d.status,
      'outstanding_amount', d.outstanding_amount,
      'paid_amount', d.paid_amount,
      'original_amount', d.original_amount
    )
    FROM customer_debts d
    WHERE d.id = debt_id_param
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.pay_customer_debt(
  UUID,
  UUID,
  UUID,
  UUID,
  DECIMAL,
  TEXT
) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4) CUSTOMER KPIs VIEW
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW customer_kpis AS
SELECT
  c.id AS customer_id,
  c.organization_id,
  COALESCE(COUNT(t.id), 0)::BIGINT AS purchases_count,
  COALESCE(SUM(t.total_amount), 0)::DECIMAL(12, 2) AS total_spent,
  COALESCE(AVG(t.total_amount), 0)::DECIMAL(12, 2) AS average_check,
  MIN(t.created_at) AS first_purchase_at,
  MAX(t.created_at) AS last_purchase_at,
  COALESCE(
    (
      SELECT SUM(d.outstanding_amount)
      FROM customer_debts d
      WHERE d.customer_id = c.id
        AND d.status IN ('open', 'partially_paid')
    ),
    0
  )::DECIMAL(12, 2) AS current_debt
FROM customers c
LEFT JOIN transactions t ON t.customer_id = c.id AND t.type = 'sale'
GROUP BY c.id, c.organization_id;

-- -----------------------------------------------------------------------------
-- 5) RLS
-- -----------------------------------------------------------------------------

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customers'
      AND policyname = 'Users can view customers in their organization'
  ) THEN
    CREATE POLICY "Users can view customers in their organization" ON customers
      FOR SELECT USING (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customers'
      AND policyname = 'Users can manage customers in their organization'
  ) THEN
    CREATE POLICY "Users can manage customers in their organization" ON customers
      FOR ALL USING (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_methods'
      AND policyname = 'Users can view payment methods in their organization'
  ) THEN
    CREATE POLICY "Users can view payment methods in their organization" ON payment_methods
      FOR SELECT USING (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_methods'
      AND policyname = 'Users can manage payment methods in their organization'
  ) THEN
    CREATE POLICY "Users can manage payment methods in their organization" ON payment_methods
      FOR ALL USING (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sale_payments'
      AND policyname = 'Users can view sale payments in their organization'
  ) THEN
    CREATE POLICY "Users can view sale payments in their organization" ON sale_payments
      FOR SELECT USING (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sale_payments'
      AND policyname = 'Users can manage sale payments in their organization'
  ) THEN
    CREATE POLICY "Users can manage sale payments in their organization" ON sale_payments
      FOR ALL USING (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customer_debts'
      AND policyname = 'Users can view customer debts in their organization'
  ) THEN
    CREATE POLICY "Users can view customer debts in their organization" ON customer_debts
      FOR SELECT USING (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customer_debts'
      AND policyname = 'Users can manage customer debts in their organization'
  ) THEN
    CREATE POLICY "Users can manage customer debts in their organization" ON customer_debts
      FOR ALL USING (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'debt_payments'
      AND policyname = 'Users can view debt payments in their organization'
  ) THEN
    CREATE POLICY "Users can view debt payments in their organization" ON debt_payments
      FOR SELECT USING (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'debt_payments'
      AND policyname = 'Users can manage debt payments in their organization'
  ) THEN
    CREATE POLICY "Users can manage debt payments in their organization" ON debt_payments
      FOR ALL USING (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'integration_requests'
      AND policyname = 'Users can view integration requests in their organization'
  ) THEN
    CREATE POLICY "Users can view integration requests in their organization" ON integration_requests
      FOR SELECT USING (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'integration_requests'
      AND policyname = 'Users can manage integration requests in their organization'
  ) THEN
    CREATE POLICY "Users can manage integration requests in their organization" ON integration_requests
      FOR ALL USING (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        organization_id IN (
          SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

COMMENT ON TABLE customers IS 'CRM: customer profiles';
COMMENT ON TABLE payment_methods IS 'Configurable payment methods per organization';
COMMENT ON TABLE sale_payments IS 'Mixed payments attached to sale transactions';
COMMENT ON TABLE customer_debts IS 'Customer debt registry (auto debt on partial payment)';
COMMENT ON TABLE debt_payments IS 'Debt repayments history';
COMMENT ON TABLE integration_requests IS 'n8n/agent request logs with idempotency support';
COMMENT ON VIEW customer_kpis IS 'Customer indicators: purchases, avg check, debt, first/last visit';
