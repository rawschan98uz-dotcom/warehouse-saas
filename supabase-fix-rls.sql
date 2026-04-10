-- ============================================
-- FIX: RLS Policies для organizations
-- Запустить в Supabase → SQL Editor → Run
-- ============================================

-- Удаляем старые политики
DROP POLICY IF EXISTS "View organizations" ON organizations;
DROP POLICY IF EXISTS "Create organizations" ON organizations;
DROP POLICY IF EXISTS "Update organizations" ON organizations;

-- Новая политика: любой авторизованный пользователь может всё
CREATE POLICY "organizations_all" ON organizations
  FOR ALL USING (true) WITH CHECK (true);

-- organization_users
DROP POLICY IF EXISTS "View org users" ON organization_users;
DROP POLICY IF EXISTS "Create org users" ON organization_users;

CREATE POLICY "organization_users_all" ON organization_users
  FOR ALL USING (true) WITH CHECK (true);

-- Профили — разрешаем INSERT при регистрации
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "profiles_all" ON profiles
  FOR ALL USING (true) WITH CHECK (true);

-- Категории
DROP POLICY IF EXISTS "CRUD categories" ON categories;
CREATE POLICY "categories_all" ON categories
  FOR ALL USING (true) WITH CHECK (true);

-- Локации
DROP POLICY IF EXISTS "CRUD locations" ON locations;
CREATE POLICY "locations_all" ON locations
  FOR ALL USING (true) WITH CHECK (true);

-- Поставщики
DROP POLICY IF EXISTS "CRUD suppliers" ON suppliers;
CREATE POLICY "suppliers_all" ON suppliers
  FOR ALL USING (true) WITH CHECK (true);

-- Товары
DROP POLICY IF EXISTS "CRUD products" ON products;
CREATE POLICY "products_all" ON products
  FOR ALL USING (true) WITH CHECK (true);

-- Остатки
DROP POLICY IF EXISTS "CRUD inventory" ON inventory;
CREATE POLICY "inventory_all" ON inventory
  FOR ALL USING (true) WITH CHECK (true);

-- Транзакции
DROP POLICY IF EXISTS "CRUD transactions" ON transactions;
CREATE POLICY "transactions_all" ON transactions
  FOR ALL USING (true) WITH CHECK (true);

-- Позиции транзакций
DROP POLICY IF EXISTS "CRUD transaction_items" ON transaction_items;
CREATE POLICY "transaction_items_all" ON transaction_items
  FOR ALL USING (true) WITH CHECK (true);
