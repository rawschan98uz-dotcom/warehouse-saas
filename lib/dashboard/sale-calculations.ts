import type { PaymentFormItem, SaleItemForm } from '@/lib/dashboard/types'

export function calculateSaleItemsTotal(items: SaleItemForm[]) {
  return items.reduce((sum, item) => sum + item.quantity * item.price, 0)
}

export function calculatePaymentsTotal(items: PaymentFormItem[]) {
  return items.reduce((sum, item) => sum + item.amount, 0)
}
