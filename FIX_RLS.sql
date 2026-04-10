-- Исправление RLS политик для organizations и organization_users
-- Выполните этот скрипт в Supabase SQL Editor

-- Добавляем политику INSERT для organizations
CREATE POLICY "Users can insert organizations" ON organizations
  FOR INSERT WITH CHECK (true);

-- Добавляем политику INSERT для organization_users
CREATE POLICY "Users can insert organization memberships" ON organization_users
  FOR INSERT WITH CHECK (true);
