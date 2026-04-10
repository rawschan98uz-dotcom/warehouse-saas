export interface PaymentMethodOption {
  id: string
  name: string
  code: string
  type: 'cash' | 'card' | 'bank_transfer' | 'digital_wallet' | 'other'
  is_active: boolean
}

export interface CustomerOption {
  id: string
  full_name: string
  phone: string | null
  email: string | null
}

export interface SaleItemForm {
  product_id: string
  quantity: number
  price: number
  currency: string
}

export interface PaymentFormItem {
  payment_method_id: string
  amount: number
}

export interface ProductWithStock {
  id: string
  name: string
  sku: string
  sale_price: number
  currency: string
  unit: string
  available_quantity: number
}
