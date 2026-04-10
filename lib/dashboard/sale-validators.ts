import type {
  CustomerOption,
  PaymentFormItem,
  PaymentMethodOption,
  ProductWithStock,
  SaleItemForm,
} from '@/lib/dashboard/types'

interface ValidationResult {
  valid: boolean
  error?: string
}

export function validateSaleItems(
  saleItems: SaleItemForm[],
  products: ProductWithStock[]
): ValidationResult {
  const validItems = saleItems.filter((item) => item.product_id && item.quantity > 0)

  if (validItems.length === 0) {
    return { valid: false, error: 'Добавьте хотя бы один товар' }
  }

  for (const item of validItems) {
    const product = products.find((p) => p.id === item.product_id)
    if (!product) {
      return { valid: false, error: 'Один из товаров не найден' }
    }
    if (item.quantity > product.available_quantity) {
      return {
        valid: false,
        error: `Недостаточно остатка: ${product.name} (доступно ${product.available_quantity})`,
      }
    }
  }

  return { valid: true }
}

export function validatePayments(
  payments: PaymentFormItem[],
  methods: PaymentMethodOption[],
  total: number,
  selectedCustomer: string,
  customers: CustomerOption[]
): ValidationResult {
  const validPayments = payments.filter((p) => p.payment_method_id && p.amount > 0)
  const paid = validPayments.reduce((sum, p) => sum + p.amount, 0)

  const hasCustomer = Boolean(selectedCustomer)

  if (paid <= 0) {
    if (!hasCustomer) {
      return {
        valid: false,
        error: 'Добавьте платеж или выберите клиента для продажи полностью в долг',
      }
    }
  }

  if (paid > total) {
    return { valid: false, error: 'Сумма платежей не может превышать сумму продажи' }
  }

  for (const payment of validPayments) {
    const method = methods.find((m) => m.id === payment.payment_method_id)
    if (!method || !method.is_active) {
      return { valid: false, error: 'Выбран неактивный способ оплаты' }
    }
  }

  const hasDebt = total - paid > 0.0001
  if (hasDebt) {
    if (!selectedCustomer) {
      return { valid: false, error: 'Для продажи в долг выберите клиента' }
    }
    if (!customers.some((c) => c.id === selectedCustomer)) {
      return { valid: false, error: 'Клиент для долга не найден' }
    }
  }

  return { valid: true }
}
