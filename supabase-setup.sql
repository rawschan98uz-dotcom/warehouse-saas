-- ============================================
-- WAREHOUSE SAAS - SUPABASE SCHEMA
-- ============================================
-- Скопируйте весь этот код и вставьте в:
-- Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================

-- 1. ПРОФИЛИ ПОЛЬЗОВАТЕЛЕЙ
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Автоматическое создание профиля при регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. ОРГАНИЗАЦИИ
CREATE TABLE IF NOT EXISTS organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT DEFAULT 'UZS',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. СВЯЗЬ ПОЛЬЗОВАТЕЛЬ-ОРГАНИЗАЦИЯ
CREATE TABLE IF NOT EXISTS organization_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'admin',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- 4. КАТЕГОРИИ
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. ЛОКАЦИИ (СКЛАДЫ / МАГАЗИНЫ)
CREATE TABLE IF NOT EXISTS locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('warehouse', 'store')),
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. ПОСТАВЩИКИ
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. ТОВАРЫ
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  unit TEXT DEFAULT 'шт',
  purchase_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
  sale_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'UZS',
  min_stock_level NUMERIC(15, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. ОСТАТКИ (ИНВЕНТАРЬ)
CREATE TABLE IF NOT EXISTS inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  quantity NUMERIC(15, 2) DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(product_id, location_id)
);

-- 9. ТРАНЗАКЦИИ
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('arrival', 'sale', 'transfer', 'expense')),
  from_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  to_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  total_amount NUMERIC(15, 2) DEFAULT 0,
  currency TEXT DEFAULT 'UZS',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. ПОЗИЦИИ ТРАНЗАКЦИЙ
CREATE TABLE IF NOT EXISTS transaction_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  quantity NUMERIC(15, 2) NOT NULL,
  price NUMERIC(15, 2) NOT NULL,
  currency TEXT DEFAULT 'UZS',
  total NUMERIC(15, 2) NOT NULL
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Включаем RLS на всех таблицах
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;

-- Профили: пользователь видит только свой
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Организации: через organization_users
CREATE POLICY "View organizations" ON organizations
  FOR SELECT USING (
    id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Create organizations" ON organizations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Update organizations" ON organizations
  FOR UPDATE USING (
    id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

-- Organization users
CREATE POLICY "View org users" ON organization_users
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Create org users" ON organization_users
  FOR INSERT WITH CHECK (true);

-- Категории
CREATE POLICY "CRUD categories" ON categories
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

-- Локации
CREATE POLICY "CRUD locations" ON locations
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

-- Поставщики
CREATE POLICY "CRUD suppliers" ON suppliers
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

-- Товары
CREATE POLICY "CRUD products" ON products
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

-- Остатки
CREATE POLICY "CRUD inventory" ON inventory
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

-- Транзакции
CREATE POLICY "CRUD transactions" ON transactions
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

-- Позиции транзакций
CREATE POLICY "CRUD transaction_items" ON transaction_items
  FOR ALL USING (
    transaction_id IN (
      SELECT id FROM transactions WHERE organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================
-- ИНДЕКСЫ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ
-- ============================================

CREATE INDEX IF NOT EXISTS idx_products_org ON products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_transactions_org ON transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_items_tx ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_product ON transaction_items(product_id);
CREATE INDEX IF NOT EXISTS idx_locations_org ON locations(organization_id);
CREATE INDEX IF NOT EXISTS idx_categories_org ON categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_org ON suppliers(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_users_user ON organization_users(user_id);

-- ============================================
-- ГОТОВО!
-- ============================================
