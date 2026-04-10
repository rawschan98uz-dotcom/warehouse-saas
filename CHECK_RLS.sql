-- Проверка текущих RLS политик
-- Выполните этот скрипт, чтобы увидеть все политики

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('organizations', 'organization_users', 'products')
ORDER BY tablename, policyname;
