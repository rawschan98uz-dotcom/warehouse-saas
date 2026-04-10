# Деплой на Vercel 🚀

## Подготовка к деплою

### 1. Проверка проекта

Убедитесь, что проект работает локально:
```bash
npm run build
npm start
```

Если сборка прошла успешно, можно деплоить!

## Деплой через GitHub

### Шаг 1: Создайте репозиторий на GitHub

1. Перейдите на [github.com](https://github.com)
2. Нажмите "New repository"
3. Заполните:
   - Repository name: `warehouse-saas`
   - Description: "SaaS система управления складом"
   - Visibility: Private (рекомендуется)
4. Нажмите "Create repository"

### Шаг 2: Загрузите код на GitHub

```bash
# Инициализируйте git (если еще не сделано)
git init

# Добавьте все файлы
git add .

# Создайте первый коммит
git commit -m "Initial commit: Warehouse Management SaaS"

# Добавьте remote репозиторий
git remote add origin https://github.com/ваш-username/warehouse-saas.git

# Загрузите код
git branch -M main
git push -u origin main
```

### Шаг 3: Подключите Vercel

1. Перейдите на [vercel.com](https://vercel.com)
2. Нажмите "Sign Up" или "Login"
3. Войдите через GitHub
4. Нажмите "Add New..." → "Project"
5. Выберите репозиторий `warehouse-saas`
6. Нажмите "Import"

### Шаг 4: Настройте переменные окружения

В настройках проекта на Vercel:

1. Перейдите в "Settings" → "Environment Variables"
2. Добавьте переменные:

```
NEXT_PUBLIC_SUPABASE_URL = https://ваш-проект.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = ваш_anon_ключ
```

3. Выберите окружения: Production, Preview, Development
4. Нажмите "Save"

### Шаг 5: Деплой

1. Нажмите "Deploy"
2. Подождите 2-3 минуты
3. Готово! 🎉

Ваш сайт будет доступен по адресу: `https://warehouse-saas.vercel.app`

## Настройка кастомного домена (опционально)

### Шаг 1: Добавьте домен в Vercel

1. В настройках проекта перейдите в "Domains"
2. Нажмите "Add"
3. Введите ваш домен: `warehouse.yourdomain.com`
4. Нажмите "Add"

### Шаг 2: Настройте DNS

Добавьте CNAME запись у вашего DNS провайдера:

```
Type: CNAME
Name: warehouse
Value: cname.vercel-dns.com
```

### Шаг 3: Обновите Supabase

В Supabase перейдите в:
1. **Settings** → **API**
2. **Site URL**: `https://warehouse.yourdomain.com`
3. **Redirect URLs**: добавьте `https://warehouse.yourdomain.com/**`

## Автоматический деплой

После настройки каждый push в GitHub будет автоматически деплоить проект:

```bash
# Внесите изменения
git add .
git commit -m "Update: добавлена новая функция"
git push

# Vercel автоматически задеплоит изменения
```

## Деплой через Vercel CLI (альтернатива)

### Установка CLI

```bash
npm install -g vercel
```

### Деплой

```bash
# Войдите в аккаунт
vercel login

# Деплой проекта
vercel

# Или сразу в продакшн
vercel --prod
```

## Проверка после деплоя

### 1. Проверьте сайт
Откройте ваш URL и убедитесь, что:
- ✅ Страница загружается
- ✅ Дизайн отображается корректно
- ✅ Можно зарегистрироваться
- ✅ Можно войти в систему

### 2. Проверьте переменные окружения
Если есть ошибки подключения к Supabase:
- Проверьте переменные в Vercel Settings
- Убедитесь, что нет лишних пробелов
- Перезапустите деплой

### 3. Проверьте логи
В Vercel перейдите в:
- **Deployments** → выберите деплой → **Logs**
- Проверьте на наличие ошибок

## Настройка продакшн окружения

### 1. Включите Email подтверждение в Supabase

1. **Authentication** → **Providers** → **Email**
2. **Confirm email**: ON
3. Настройте Email шаблоны

### 2. Настройте CORS в Supabase

1. **Settings** → **API**
2. **CORS Allowed Origins**: добавьте ваш домен

### 3. Настройте Rate Limiting (опционально)

В Vercel можно настроить защиту от DDoS:
1. **Settings** → **Security**
2. Включите "DDoS Protection"

## Мониторинг

### Vercel Analytics

1. В проекте перейдите в **Analytics**
2. Включите "Enable Analytics"
3. Установите пакет:
```bash
npm install @vercel/analytics
```

4. Добавьте в `app/layout.tsx`:
```typescript
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

### Vercel Speed Insights

```bash
npm install @vercel/speed-insights
```

```typescript
import { SpeedInsights } from '@vercel/speed-insights/next'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  )
}
```

## Обновление проекта

### Обновление кода

```bash
# Внесите изменения
git add .
git commit -m "Описание изменений"
git push

# Vercel автоматически задеплоит
```

### Откат к предыдущей версии

1. В Vercel перейдите в **Deployments**
2. Найдите нужную версию
3. Нажмите "..." → "Promote to Production"

## Резервное копирование

### База данных (Supabase)

1. **Database** → **Backups**
2. Настройте автоматические бэкапы
3. Или экспортируйте вручную через SQL Editor

### Код (GitHub)

Код автоматически сохраняется в GitHub при каждом push.

## Стоимость

### Vercel
- **Hobby Plan**: Бесплатно
  - 100 GB bandwidth
  - Unlimited deployments
  - Automatic HTTPS

- **Pro Plan**: $20/месяц
  - 1 TB bandwidth
  - Advanced analytics
  - Team collaboration

### Supabase
- **Free Plan**: Бесплатно
  - 500 MB database
  - 1 GB file storage
  - 50,000 monthly active users

- **Pro Plan**: $25/месяц
  - 8 GB database
  - 100 GB file storage
  - 100,000 monthly active users

## Troubleshooting

### Ошибка "Module not found"
```bash
# Очистите кэш и переустановите
rm -rf node_modules package-lock.json
npm install
git add .
git commit -m "Fix: reinstall dependencies"
git push
```

### Ошибка подключения к Supabase
- Проверьте переменные окружения в Vercel
- Убедитесь, что домен добавлен в Supabase Redirect URLs

### Медленная загрузка
- Включите Vercel Analytics для диагностики
- Оптимизируйте изображения
- Используйте кэширование

## Полезные команды

```bash
# Просмотр логов
vercel logs

# Список деплоев
vercel ls

# Информация о проекте
vercel inspect

# Удалить деплой
vercel remove [deployment-url]
```

## Чеклист перед продакшеном

- [ ] Тестирование всех функций
- [ ] Проверка безопасности
- [ ] Настройка Email подтверждения
- [ ] Настройка кастомного домена
- [ ] Включение Analytics
- [ ] Настройка бэкапов
- [ ] Проверка производительности
- [ ] Документация для пользователей

## Поддержка

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Support](https://vercel.com/support)
- [Supabase Documentation](https://supabase.com/docs)

---

**Готово! Ваш проект в продакшене! 🚀**
