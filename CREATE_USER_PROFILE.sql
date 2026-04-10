-- Исправление: Создание профиля и организации для текущего пользователя
-- Выполните этот скрипт в Supabase SQL Editor

-- 1. Создаем профиль для текущего пользователя (если его нет)
INSERT INTO profiles (id, email, full_name)
SELECT 
  auth.uid(),
  (SELECT email FROM auth.users WHERE id = auth.uid()),
  (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = auth.uid())
ON CONFLICT (id) DO NOTHING;

-- 2. Создаем организацию (если её нет)
INSERT INTO organizations (name, currency)
VALUES ('Моя организация', 'UZS')
ON CONFLICT DO NOTHING
RETURNING id;

-- 3. Связываем пользователя с организацией
-- ВАЖНО: Замените 'ORGANIZATION_ID' на ID из результата шага 2
-- Или выполните этот запрос отдельно после получения ID организации
INSERT INTO organization_users (organization_id, user_id, role)
SELECT 
  (SELECT id FROM organizations ORDER BY created_at DESC LIMIT 1),
  auth.uid(),
  'admin'
ON CONFLICT (organization_id, user_id) DO NOTHING;
