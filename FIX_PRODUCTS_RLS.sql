-- Исправление политики для products
-- Удаляем старую политику и создаем новую с правильным with_check

DROP POLICY IF EXISTS "Users can manage products" ON products;

-- Создаем политику для просмотра
CREATE POLICY "Users can view products in their organization" ON products
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

-- Создаем политику для вставки, обновления и удаления
CREATE POLICY "Users can manage products in their organization" ON products
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
