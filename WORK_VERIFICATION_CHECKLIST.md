# Проверка выполненных изменений (SaaS Warehouse + CRM + Долги + n8n API)

Этот документ нужен, чтобы вы быстро проверили, что всё работает корректно после обновлений.

## 1) Что было сделано

### 1.1 Архитектура и стабильность
- Обновлен проект под актуальный Next.js 16 с `proxy.ts` вместо deprecated `middleware.ts`.
- Вынесена логика получения/создания организации пользователя в `lib/org/organization.ts`.
- Контекст авторизации переведен на безопасную автопривязку к организации через RPC `ensure_user_organization`.
- Удален устаревший и потенциально опасный вспомогательный JS (`setup-db.js`, `setup-tables.js`) с хардкодом ключей.

### 1.2 База данных (Supabase)
- Добавлена новая миграция `supabase/phase2-crm-payments-migration.sql`:
  - CRM таблицы: `customers`.
  - Кастомные оплаты: `payment_methods`, `sale_payments`.
  - Долги клиентов: `customer_debts`, `debt_payments`.
  - Интеграционный лог и идемпотентность: `integration_requests`.
  - Метаданные организации: `organizations.metadata` (в т.ч. для `integration_api_key`).
  - Представление KPI: `customer_kpis`.
  - Функции:
    - `ensure_user_organization()`
    - `create_sale_with_payments(...)`
    - `pay_customer_debt(...)`
    - `refresh_customer_debt_status(...)`
  - Триггеры/политики RLS добавлены для новых сущностей.

### 1.3 API для n8n / Telegram-агентов
- Добавлены route handlers:
  - `app/api/v1/health/route.ts`
  - `app/api/v1/customers/route.ts`
  - `app/api/v1/customers/[id]/route.ts`
  - `app/api/v1/payment-methods/route.ts`
  - `app/api/v1/sales/route.ts`
  - `app/api/v1/debts/[id]/payments/route.ts`
  - `app/api/v1/reports/sales/route.ts`
  - `app/api/v1/reports/products/route.ts`
  - `app/api/v1/reports/customers/route.ts`
- Добавлены вспомогательные модули API:
  - `lib/supabase/admin.ts` (service-role client)
  - `lib/api/integration-auth.ts` (проверка `x-org-id` + `x-api-key`)
  - `lib/api/integration-idempotency.ts` (`x-idempotency-key`)
  - `lib/api/http.ts` (стандартные JSON ответы)

### 1.4 Frontend модули
- Новый экран клиентов: `app/(dashboard)/dashboard/customers/page.tsx`.
- Новый экран долгов: `app/(dashboard)/dashboard/debts/page.tsx`.
- Новый экран типов оплат: `app/(dashboard)/dashboard/payment-methods/page.tsx`.
- Обновлена навигация: `components/dashboard/dashboard-nav.tsx`.
- Переписана логика продаж с поддержкой смешанных оплат и автодолга:
  - `app/(dashboard)/dashboard/sales/page.tsx`
  - добавлены утилиты: `lib/dashboard/sale-calculations.ts`, `lib/dashboard/sale-validators.ts`, `lib/dashboard/types.ts`
- Дашборд расширен KPI по долгам: `app/(dashboard)/dashboard/page.tsx`.

### 1.5 Техдолг/мертвый код
- Удален неиспользуемый `components/dashboard/quick-sale-dialog.tsx`.
- Удален debug-роут `app/(dashboard)/dashboard/test-db/page.tsx`.
- Удалены неиспользуемые типы/утилиты (`SelectOption`, `clampAmount`).

---

## 2) Что уже проверено мной

### 2.1 Сборка
- Команда: `npm.cmd run build`
- Результат: **успешно** (после очистки `.next`).

### 2.2 Логика изменений (ревью)
- Проверена цепочка продажи:
  - проверка остатков
  - создание транзакции
  - запись позиций
  - запись оплат
  - автосоздание долга при недоплате
- Проверена логика погашения долга:
  - запрет переплаты
  - автоматический пересчет статуса долга
- Проверена безопасность API:
  - обязательные заголовки (`x-org-id`, `x-api-key`)
  - идемпотентность для критичных POST (`x-idempotency-key`)
- Проверена связность навигации и страниц дашборда.

### 2.3 Что не финализировано
- `npm.cmd run lint` сейчас показывает исторические ошибки проекта (много `any` и React hooks warnings в старых файлах).
- Это не блокирует прод-сборку, но желательно отдельной задачей довести lint до нуля.

---

## 3) Чеклист ручной проверки (ваша проверка)

## 3.1 Применение БД
- [ ] В Supabase SQL Editor выполнить `supabase/phase2-crm-payments-migration.sql`.
- [ ] Убедиться, что появились таблицы:
  - `customers`, `payment_methods`, `sale_payments`, `customer_debts`, `debt_payments`, `integration_requests`.
- [ ] Убедиться, что в `organizations` появился `metadata`.
- [ ] Убедиться, что view `customer_kpis` создан.

## 3.2 Ключ интеграции (для API)
- [ ] В `organizations.metadata` установить `integration_api_key`.
  - Пример SQL:
  ```sql
  update organizations
  set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{integration_api_key}', '"YOUR_SECRET_KEY"')
  where id = 'YOUR_ORG_ID';
  ```

## 3.3 Базовая работа UI
- [ ] Логин/регистрация работают.
- [ ] Открываются новые страницы:
  - `/dashboard/customers`
  - `/dashboard/debts`
  - `/dashboard/payment-methods`
- [ ] На дашборде отображаются метрики долгов.

## 3.4 Клиенты
- [ ] Создать клиента вручную через UI.
- [ ] Проверить отображение клиента в списке.
- [ ] Открыть профиль клиента, убедиться что видны KPI/покупки/долги.

## 3.5 Типы оплат
- [ ] Проверить, что дефолтные методы оплат есть (cash/card/transfer/click/payme).
- [ ] Добавить новый метод оплаты.
- [ ] Отключить и включить метод — статус меняется.

## 3.6 Продажа со смешанной оплатой и автодолгом
- [ ] Создать продажу с 2 товарами.
- [ ] Указать 2 платежа (например cash + card).
- [ ] Проверить случай полной оплаты: долг не создается.
- [ ] Проверить случай недоплаты: долг создается автоматически.
- [ ] Проверить, что продажа уменьшает остатки по складу/магазину.

## 3.7 Погашение долга
- [ ] Открыть `/dashboard/debts`.
- [ ] Внести частичный платеж — статус `partially_paid`.
- [ ] Внести остаток — статус `closed`.
- [ ] Попробовать переплату — должна быть ошибка и отказ.

## 3.8 API проверки (n8n-ready)

Использовать заголовки:
- `x-org-id: <ORG_UUID>`
- `x-api-key: <INTEGRATION_API_KEY>`

Для POST где требуется идемпотентность:
- `x-idempotency-key: <UNIQUE_KEY>`

- [ ] `GET /api/v1/health` -> `success=true`.
- [ ] `GET /api/v1/payment-methods` -> список методов.
- [ ] `POST /api/v1/customers` -> создание клиента.
- [ ] `GET /api/v1/customers` -> клиент виден.
- [ ] `POST /api/v1/sales` -> продажа создается.
- [ ] Повтор того же запроса с тем же `x-idempotency-key` -> `replay=true`.
- [ ] `POST /api/v1/debts/{id}/payments` -> платеж применен.
- [ ] `GET /api/v1/reports/sales` -> отчет возвращается.
- [ ] `GET /api/v1/reports/products` -> отчет возвращается.
- [ ] `GET /api/v1/reports/customers` -> отчет возвращается.

## 3.9 RLS/изоляция
- [ ] Пользователь организации A не видит данные организации B.
- [ ] Через API с неверным `x-api-key` доступ запрещен.

## 3.10 Регрессия старых модулей
- [ ] Категории: создание/просмотр.
- [ ] Товары: добавление/редактирование/импорт.
- [ ] Инвентаризация: сессия, ввод факта, применение.
- [ ] Транзакции: перевод между локациями.
- [ ] Отчеты/локации/поставщики открываются без критических ошибок.

---

## 4) Известные риски и ограничения

- Линтер по проекту пока не "зелёный" из-за исторического кода (это было до изменений).
- API-авторизация сейчас завязана на `organizations.metadata.integration_api_key`; это простой и практичный вариант, но в будущем можно вынести в отдельную таблицу ключей с ротацией.
- В `create_sale_with_payments` валюта для `debt_payments` сейчас фиксирована `UZS`; если нужно строго мультивалютно — расширим в следующем шаге.
- Если в одной продаже одна и та же позиция товара добавлена несколькими строками, в актуальной версии это корректно валидируется суммарно по остатку.

---

## 5) Рекомендуемые команды перед деплоем

```bash
npm install
npm run build
```

После этого — деплой на Vercel и установка env:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
