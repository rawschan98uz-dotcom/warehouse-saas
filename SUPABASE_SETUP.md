# Инструкция по настройке Supabase

## Шаг 1: Создание проекта

1. Перейдите на [supabase.com](https://supabase.com)
2. Нажмите "Start your project"
3. Войдите через GitHub или создайте аккаунт
4. Создайте новую организацию (если нужно)
5. Нажмите "New Project"
6. Заполните данные:
   - **Name**: warehouse-saas (или любое другое имя)
   - **Database Password**: Создайте надежный пароль (сохраните его!)
   - **Region**: Выберите ближайший регион
   - **Pricing Plan**: Free (для начала)
7. Нажмите "Create new project"
8. Подождите 1-2 минуты пока проект создается

## Шаг 2: Получение ключей API

1. После создания проекта перейдите в **Settings** (иконка шестеренки слева)
2. Выберите **API**
3. Скопируйте:
   - **Project URL** (например: https://xxxxx.supabase.co)
   - **anon public** ключ (длинная строка)

## Шаг 3: Создание схемы базы данных

1. В левом меню выберите **SQL Editor**
2. Нажмите **New query**
3. Откройте файл `supabase/schema.sql` из проекта
4. Скопируйте весь SQL код
5. Вставьте в SQL Editor в Supabase
6. Нажмите **Run** (или Ctrl+Enter)
7. Дождитесь выполнения (должно появиться "Success. No rows returned")

## Шаг 4: Проверка таблиц

1. В левом меню выберите **Table Editor**
2. Убедитесь, что созданы следующие таблицы:
   - organizations
   - profiles
   - organization_users
   - categories
   - locations
   - suppliers
   - products
   - inventory
   - transactions
   - transaction_items

## Шаг 5: Настройка Authentication

1. В левом меню выберите **Authentication**
2. Перейдите в **Providers**
3. Убедитесь, что **Email** провайдер включен
4. В настройках Email провайдера:
   - **Enable Email provider**: ON
   - **Confirm email**: OFF (для разработки, включите в продакшене)
   - **Secure email change**: ON

## Шаг 6: Настройка переменных окружения

1. Откройте файл `.env.local` в корне проекта
2. Замените значения:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ваш_anon_ключ
```

## Шаг 7: Проверка работы

1. Запустите приложение:
```bash
npm run dev
```

2. Откройте http://localhost:3000
3. Перейдите на страницу регистрации
4. Создайте тестовый аккаунт
5. Войдите в систему

## Проверка данных в Supabase

После регистрации проверьте в Supabase:

1. **Table Editor** → **profiles** - должна появиться запись с вашим email
2. **Authentication** → **Users** - должен появиться ваш пользователь

## Возможные проблемы

### Ошибка "relation does not exist"
- Убедитесь, что SQL скрипт выполнен полностью
- Проверьте, что все таблицы созданы в Table Editor

### Ошибка при регистрации
- Проверьте, что Email провайдер включен
- Убедитесь, что RLS политики созданы (они в schema.sql)

### Ошибка подключения
- Проверьте правильность URL и ключа в .env.local
- Убедитесь, что файл .env.local находится в корне проекта
- Перезапустите dev сервер после изменения .env.local

## Дополнительные настройки (опционально)

### Email шаблоны
1. **Authentication** → **Email Templates**
2. Настройте шаблоны для:
   - Подтверждение email
   - Сброс пароля
   - Изменение email

### Настройка домена (для продакшена)
1. **Settings** → **API**
2. **Site URL**: укажите URL вашего продакшн сайта
3. **Redirect URLs**: добавьте разрешенные URL для редиректа

### Backup базы данных
1. **Database** → **Backups**
2. Настройте автоматические бэкапы (доступно на платных планах)

## Полезные ссылки

- [Документация Supabase](https://supabase.com/docs)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [SQL Editor](https://supabase.com/docs/guides/database/overview)
