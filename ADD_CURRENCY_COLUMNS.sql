-- Добавление поддержки валют в существующую базу данных
-- Выполните этот скрипт в Supabase SQL Editor

-- 1. Добавляем колонку currency в таблицу organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'UZS' 
CHECK (currency IN ('UZS', 'USD'));

-- 2. Добавляем колонку currency в таблицу products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'UZS' 
CHECK (currency IN ('UZS', 'USD'));

-- 3. Добавляем колонку currency в таблицу transactions
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'UZS' 
CHECK (currency IN ('UZS', 'USD'));

-- 4. Добавляем колонку currency в таблицу transaction_items
ALTER TABLE transaction_items 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'UZS' 
CHECK (currency IN ('UZS', 'USD'));

-- 5. Проверяем результат
SELECT 
  table_name, 
  column_name, 
  data_type, 
  column_default
FROM information_schema.columns
WHERE table_name IN ('organizations', 'products', 'transactions', 'transaction_items')
  AND column_name = 'currency'
ORDER BY table_name;
