-- Проверка данных пользователя
-- Выполните этот скрипт, чтобы увидеть ваши данные

-- 1. Проверяем профиль пользователя
SELECT id, email, full_name, created_at 
FROM profiles 
WHERE id = auth.uid();

-- 2. Проверяем связь с организацией
SELECT ou.id, ou.organization_id, ou.user_id, ou.role, o.name as org_name
FROM organization_users ou
LEFT JOIN organizations o ON o.id = ou.organization_id
WHERE ou.user_id = auth.uid();

-- 3. Проверяем все организации
SELECT * FROM organizations;

-- 4. Проверяем все связи пользователей с организациями
SELECT * FROM organization_users;
