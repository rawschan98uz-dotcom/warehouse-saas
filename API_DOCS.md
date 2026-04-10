# API и структура данных

## Типы транзакций

Система поддерживает следующие типы операций:

### 1. Приход товара (arrival)
Оприходование товаров на склад или в магазин.

**Поля:**
- `to_location_id` - куда поступает товар
- `supplier_id` - от какого поставщика (опционально)

**Пример использования:**
```typescript
const transaction = {
  type: 'arrival',
  to_location_id: 'warehouse-id',
  supplier_id: 'supplier-id',
  items: [
    { product_id: 'product-1', quantity: 100, price: 50 }
  ]
}
```

### 2. Продажа (sale)
Продажа товаров со склада или магазина.

**Поля:**
- `from_location_id` - откуда продается (склад/магазин)

**Эффект:** Уменьшает остатки на указанной локации

### 3. Перевод (transfer)
Перемещение товаров между локациями.

**Поля:**
- `from_location_id` - откуда
- `to_location_id` - куда

**Эффект:** Уменьшает остатки на from_location, увеличивает на to_location

### 4. Расход/Списание (expense)
Списание товаров (брак, потери, возврат и т.д.)

**Поля:**
- `from_location_id` - откуда списывается

**Эффект:** Уменьшает остатки на указанной локации

### 5. Покупка (purchase)
Закупка товаров у поставщика (планируется).

## Структура базы данных

### organizations
Организации (мультитенантность)

```typescript
{
  id: UUID
  name: string
  created_at: timestamp
  updated_at: timestamp
}
```

### profiles
Профили пользователей

```typescript
{
  id: UUID (ссылка на auth.users)
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: timestamp
  updated_at: timestamp
}
```

### organization_users
Связь пользователей с организациями

```typescript
{
  id: UUID
  organization_id: UUID
  user_id: UUID
  role: 'admin' | 'manager' | 'staff'
  created_at: timestamp
}
```

### products
Каталог товаров

```typescript
{
  id: UUID
  organization_id: UUID
  category_id: UUID | null
  sku: string (уникальный в рамках организации)
  name: string
  description: string | null
  unit: string (шт, кг, л и т.д.)
  purchase_price: decimal(10,2)
  sale_price: decimal(10,2)
  min_stock_level: integer
  image_url: string | null
  created_at: timestamp
  updated_at: timestamp
}
```

### locations
Склады и магазины

```typescript
{
  id: UUID
  organization_id: UUID
  name: string
  type: 'warehouse' | 'store'
  address: string | null
  manager_id: UUID | null
  created_at: timestamp
  updated_at: timestamp
}
```

### inventory
Остатки товаров по локациям

```typescript
{
  id: UUID
  organization_id: UUID
  product_id: UUID
  location_id: UUID
  quantity: decimal(10,2)
  updated_at: timestamp
}
```

**Уникальность:** (product_id, location_id)

### transactions
Все операции со складом

```typescript
{
  id: UUID
  organization_id: UUID
  type: 'arrival' | 'sale' | 'transfer' | 'expense' | 'purchase'
  from_location_id: UUID | null
  to_location_id: UUID | null
  supplier_id: UUID | null
  user_id: UUID (кто создал)
  total_amount: decimal(10,2)
  notes: string | null
  created_at: timestamp
}
```

### transaction_items
Позиции транзакций

```typescript
{
  id: UUID
  transaction_id: UUID
  product_id: UUID
  quantity: decimal(10,2)
  price: decimal(10,2)
  total: decimal(10,2)
  created_at: timestamp
}
```

### suppliers
Поставщики

```typescript
{
  id: UUID
  organization_id: UUID
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  created_at: timestamp
  updated_at: timestamp
}
```

## Логика обновления остатков

При создании транзакции автоматически обновляются остатки в таблице `inventory`:

### Приход (arrival)
```
inventory[product_id, to_location_id].quantity += item.quantity
```

### Продажа (sale)
```
inventory[product_id, from_location_id].quantity -= item.quantity
```

### Перевод (transfer)
```
inventory[product_id, from_location_id].quantity -= item.quantity
inventory[product_id, to_location_id].quantity += item.quantity
```

### Расход (expense)
```
inventory[product_id, from_location_id].quantity -= item.quantity
```

## Row Level Security (RLS)

Все таблицы защищены политиками RLS. Пользователи имеют доступ только к данным своей организации.

### Пример политики
```sql
CREATE POLICY "Users can view products in their organization" ON products
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );
```

## API клиенты

### Browser Client
Используется в клиентских компонентах:

```typescript
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const { data, error } = await supabase
  .from('products')
  .select('*')
```

### Server Client
Используется в серверных компонентах и API routes:

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'

const supabase = await createServerSupabaseClient()
const { data, error } = await supabase
  .from('products')
  .select('*')
```

## Примеры запросов

### Получить товары с остатками
```typescript
const { data } = await supabase
  .from('inventory')
  .select(`
    *,
    products (name, sku, unit),
    locations (name, type)
  `)
```

### Получить транзакции с деталями
```typescript
const { data } = await supabase
  .from('transactions')
  .select(`
    *,
    locations_from:from_location_id(name),
    locations_to:to_location_id(name),
    transaction_items (
      *,
      products (name, sku)
    )
  `)
```

### Создать транзакцию с позициями
```typescript
// 1. Создать транзакцию
const { data: transaction } = await supabase
  .from('transactions')
  .insert({
    organization_id: orgId,
    type: 'arrival',
    to_location_id: locationId,
    user_id: userId,
    total_amount: 1000
  })
  .select()
  .single()

// 2. Создать позиции
const items = [
  {
    transaction_id: transaction.id,
    product_id: 'product-1',
    quantity: 10,
    price: 100,
    total: 1000
  }
]

await supabase
  .from('transaction_items')
  .insert(items)

// 3. Обновить остатки
await updateInventory(orgId, 'product-1', locationId, 10)
```

## Индексы

Для оптимизации производительности созданы следующие индексы:

- `idx_products_org` - на organization_id в products
- `idx_inventory_product` - на product_id в inventory
- `idx_inventory_location` - на location_id в inventory
- `idx_transactions_org` - на organization_id в transactions
- `idx_transactions_type` - на type в transactions
- `idx_transactions_created` - на created_at в transactions

## Триггеры

### update_updated_at_column
Автоматически обновляет поле `updated_at` при изменении записи.

Применяется к таблицам:
- organizations
- profiles
- categories
- locations
- suppliers
- products
- inventory
