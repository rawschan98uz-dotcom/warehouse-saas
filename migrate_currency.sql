-- Скрипт для добавления колонок currency через psql
-- Используем прямое подключение к PostgreSQL

\c postgres

-- 1. Добавляем currency в organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'UZS';

-- 2. Добавляем currency в products  
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'UZS';

-- 3. Добавляем currency в transactions
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'UZS';

-- 4. Добавляем currency в transaction_items
ALTER TABLE transaction_items 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'UZS';

-- Проверка
SELECT table_name, column_name FROM information_schema.columns 
WHERE column_name = 'currency' AND table_schema = 'public';
