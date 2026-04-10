-- ФАЗА 1: Улучшение товаров и склада
-- Миграция для добавления новых функций

-- 1. УЛУЧШЕННАЯ КАТЕГОРИЗАЦИЯ ТОВАРОВ

-- Добавляем иерархию категорий (подкатегории)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id) ON DELETE CASCADE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Добавляем дополнительные атрибуты товаров
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS color VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS size VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Индексы для новых полей
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

-- 2. ТАБЛИЦА ДЛЯ МАССОВОЙ ЗАГРУЗКИ ТОВАРОВ

-- История импорта товаров
CREATE TABLE IF NOT EXISTS product_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  filename VARCHAR(255) NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  errors JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_imports_org ON product_imports(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_imports_status ON product_imports(status);

-- RLS для product_imports
ALTER TABLE product_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view imports in their organization" ON product_imports
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage imports in their organization" ON product_imports
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

-- 3. МОДУЛЬ ИНВЕНТАРИЗАЦИИ

-- Сессии инвентаризации
CREATE TABLE IF NOT EXISTS inventory_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  status VARCHAR(50) NOT NULL CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Позиции инвентаризации
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  expected_quantity DECIMAL(10, 2) NOT NULL DEFAULT 0,
  actual_quantity DECIMAL(10, 2),
  difference DECIMAL(10, 2) GENERATED ALWAYS AS (actual_quantity - expected_quantity) STORED,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id, product_id)
);

-- Индексы для инвентаризации
CREATE INDEX IF NOT EXISTS idx_inventory_sessions_org ON inventory_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sessions_location ON inventory_sessions(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sessions_status ON inventory_sessions(status);
CREATE INDEX IF NOT EXISTS idx_inventory_items_session ON inventory_items(session_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_product ON inventory_items(product_id);

-- Триггер для обновления updated_at в inventory_items
CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS для inventory_sessions
ALTER TABLE inventory_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inventory sessions in their organization" ON inventory_sessions
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage inventory sessions in their organization" ON inventory_sessions
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

-- RLS для inventory_items
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inventory items in their organization" ON inventory_items
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM inventory_sessions WHERE organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage inventory items in their organization" ON inventory_items
  FOR ALL USING (
    session_id IN (
      SELECT id FROM inventory_sessions WHERE organization_id IN (
        SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
      )
    )
  );

-- 4. ФУНКЦИЯ ДЛЯ ПРИМЕНЕНИЯ РЕЗУЛЬТАТОВ ИНВЕНТАРИЗАЦИИ

CREATE OR REPLACE FUNCTION apply_inventory_session(session_id_param UUID)
RETURNS JSONB AS $$
DECLARE
  session_record RECORD;
  item_record RECORD;
  result JSONB;
  updated_count INTEGER := 0;
BEGIN
  -- Проверяем статус сессии
  SELECT * INTO session_record FROM inventory_sessions WHERE id = session_id_param;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;
  
  IF session_record.status != 'in_progress' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session is not in progress');
  END IF;
  
  -- Обновляем остатки на основе фактических данных
  FOR item_record IN 
    SELECT * FROM inventory_items WHERE session_id = session_id_param AND actual_quantity IS NOT NULL
  LOOP
    -- Обновляем или создаем запись в inventory
    INSERT INTO inventory (organization_id, product_id, location_id, quantity)
    VALUES (
      session_record.organization_id,
      item_record.product_id,
      session_record.location_id,
      item_record.actual_quantity
    )
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET 
      quantity = item_record.actual_quantity,
      updated_at = NOW();
    
    updated_count := updated_count + 1;
  END LOOP;
  
  -- Обновляем статус сессии
  UPDATE inventory_sessions 
  SET status = 'completed', completed_at = NOW()
  WHERE id = session_id_param;
  
  RETURN jsonb_build_object(
    'success', true, 
    'updated_count', updated_count,
    'session_id', session_id_param
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ СТАТИСТИКИ ПО КАТЕГОРИЯМ

CREATE OR REPLACE FUNCTION get_category_stats(org_id UUID)
RETURNS TABLE (
  category_id UUID,
  category_name VARCHAR,
  product_count BIGINT,
  total_inventory_value DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as category_id,
    c.name as category_name,
    COUNT(DISTINCT p.id) as product_count,
    COALESCE(SUM(i.quantity * p.sale_price), 0) as total_inventory_value
  FROM categories c
  LEFT JOIN products p ON p.category_id = c.id AND p.organization_id = org_id
  LEFT JOIN inventory i ON i.product_id = p.id
  WHERE c.organization_id = org_id
  GROUP BY c.id, c.name
  ORDER BY c.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. ПРЕДСТАВЛЕНИЕ ДЛЯ УДОБНОГО ПРОСМОТРА ТОВАРОВ С КАТЕГОРИЯМИ

CREATE OR REPLACE VIEW products_with_categories AS
SELECT 
  p.*,
  c.name as category_name,
  pc.name as parent_category_name,
  COALESCE(SUM(i.quantity), 0) as total_quantity,
  COUNT(DISTINCT i.location_id) as locations_count
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
LEFT JOIN categories pc ON c.parent_id = pc.id
LEFT JOIN inventory i ON i.product_id = p.id
GROUP BY p.id, c.name, pc.name;

COMMENT ON TABLE categories IS 'Категории товаров с поддержкой иерархии';
COMMENT ON TABLE products IS 'Каталог товаров с расширенными атрибутами';
COMMENT ON TABLE product_imports IS 'История массовой загрузки товаров';
COMMENT ON TABLE inventory_sessions IS 'Сессии инвентаризации';
COMMENT ON TABLE inventory_items IS 'Позиции инвентаризации с расхождениями';
