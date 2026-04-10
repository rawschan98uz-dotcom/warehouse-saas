'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context'
import { createClient } from '@/lib/supabase/client'
import { resolveOrganizationId } from '@/lib/org/resolve-org-id'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { getTransactionTypeBadgeColor, getTransactionTypeLabel } from '@/lib/utils/transaction-utils'
import { Search, ShoppingCart, X } from 'lucide-react'
import type {
  CustomerOption,
  PaymentFormItem,
  PaymentMethodOption,
  ProductWithStock,
  SaleItemForm,
} from '@/lib/dashboard/types'
import { calculatePaymentsTotal, calculateSaleItemsTotal } from '@/lib/dashboard/sale-calculations'
import { validatePayments, validateSaleItems } from '@/lib/dashboard/sale-validators'

interface Location {
  id: string
  name: string
  type: 'warehouse' | 'store'
}

interface RelationProduct {
  name: string
  sku: string
}

interface RelationMethod {
  name: string
  code: string
}

interface SaleHistoryItem {
  quantity: number
  price: number
  currency: string
  products: RelationProduct | RelationProduct[] | null
}

interface SaleHistoryPayment {
  amount: number
  payment_method_id: string
  payment_methods: RelationMethod | RelationMethod[] | null
}

interface Sale {
  id: string
  type: string
  total_amount: number
  currency: string
  created_at: string
  notes: string | null
  customer_id: string | null
  customers: { full_name: string; phone: string | null } | { full_name: string; phone: string | null }[] | null
  locations_from: { name: string } | null
  transaction_items: SaleHistoryItem[]
  sale_payments: SaleHistoryPayment[]
}

interface InventoryRow {
  quantity: number
  product_id: string
}

interface ProductRow {
  id: string
  name: string
  sku: string
  sale_price: number
  currency: string
  unit: string
}

interface CustomerRow {
  id: string
  full_name: string
  phone: string | null
  email: string | null
}

interface PaymentMethodRow {
  id: string
  name: string
  code: string
  type: 'cash' | 'card' | 'bank_transfer' | 'digital_wallet' | 'other'
  is_active: boolean
}

interface PaymentMethodLookup {
  id: string
  name: string
}

interface ProductLookup {
  id: string
  name: string
  sku: string
}

interface NormalizedInventoryRow {
  product_id: string
  quantity: number
}

interface SearchSuggestion {
  id: string
  name: string
  sku: string
  available_quantity: number
  unit: string
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] || null
  return value
}

export default function SalesPage() {
  const { user, loading: authLoading, organizationId } = useAuth()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [activeOrgId, setActiveOrgId] = useState('')
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedSale, setExpandedSale] = useState<string | null>(null)
  const [showSaleForm, setShowSaleForm] = useState(false)

  const [locations, setLocations] = useState<Location[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([])

  const [selectedLocation, setSelectedLocation] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [products, setProducts] = useState<ProductWithStock[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  const [saleItems, setSaleItems] = useState<SaleItemForm[]>([
    { product_id: '', quantity: 1, price: 0, currency: 'UZS' },
  ])
  const [paymentItems, setPaymentItems] = useState<PaymentFormItem[]>([
    { payment_method_id: '', amount: 0 },
  ])
  const [saleNotes, setSaleNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saleLoading, setSaleLoading] = useState(false)
  const [saleError, setSaleError] = useState('')

  const selectedLocationData =
    locations.find((location) => location.id === selectedLocation) || null

  const selectedCustomerData =
    customers.find((customer) => customer.id === selectedCustomer) || null

  const selectedLocationType = selectedLocationData?.type || null

  const paymentMethodNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const method of paymentMethods as PaymentMethodLookup[]) {
      map.set(method.id, method.name)
    }
    return map
  }, [paymentMethods])

  const productLabelById = useMemo(() => {
    const map = new Map<string, string>()
    for (const product of products as ProductLookup[]) {
      map.set(product.id, `${product.name} (${product.sku})`)
    }
    return map
  }, [products])

  const saleTotal = calculateSaleItemsTotal(saleItems)
  const paidTotal = calculatePaymentsTotal(paymentItems)
  const outstandingAmount = Math.max(0, saleTotal - paidTotal)

  const resetSaleForm = useCallback(() => {
    setSelectedLocation('')
    setSelectedCustomer('')
    setProducts([])
    setSearchQuery('')
    setSaleItems([{ product_id: '', quantity: 1, price: 0, currency: 'UZS' }])
    setPaymentItems([{ payment_method_id: paymentMethods[0]?.id || '', amount: 0 }])
    setSaleNotes('')
    setDueDate('')
    setSaleError('')
  }, [paymentMethods])

  const fetchSales = useCallback(async (orgId: string) => {
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'id, type, total_amount, currency, created_at, notes, customer_id, customers(full_name, phone), locations_from:from_location_id(name), transaction_items(quantity, price, currency, products(name, sku)), sale_payments(amount, payment_method_id, payment_methods(name, code))'
      )
      .eq('organization_id', orgId)
      .eq('type', 'sale')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching sales:', error)
      return
    }

    setSales((data || []) as unknown as Sale[])
  }, [supabase])

  const fetchReferenceData = useCallback(async (orgId: string) => {
    const [locationsResult, customersResult, methodsResult] = await Promise.all([
      supabase
        .from('locations')
        .select('id, name, type')
        .eq('organization_id', orgId)
        .order('name'),
      supabase
        .from('customers')
        .select('id, full_name, phone, email')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('full_name'),
      supabase
        .from('payment_methods')
        .select('id, name, code, type, is_active')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('sort_order'),
    ])

    if (locationsResult.error) {
      console.error('Error loading sale locations:', locationsResult.error)
      setLocations([])
    } else {
      setLocations((locationsResult.data || []) as Location[])
    }

    if (customersResult.error) {
      console.error('Error loading sale customers:', customersResult.error)
      setCustomers([])
    } else {
      setCustomers(((customersResult.data || []) as CustomerRow[]).map((customer) => ({
        id: customer.id,
        full_name: customer.full_name,
        phone: customer.phone,
        email: customer.email,
      })))
    }

    if (methodsResult.error) {
      console.error('Error loading sale payment methods:', methodsResult.error)
      setPaymentMethods([])
      setPaymentItems([{ payment_method_id: '', amount: 0 }])
    } else {
      const methods = ((methodsResult.data || []) as PaymentMethodRow[]).map((method) => ({
        id: method.id,
        name: method.name,
        code: method.code,
        type: method.type,
        is_active: method.is_active,
      })) as PaymentMethodOption[]

      setPaymentMethods(methods)
      setPaymentItems([{ payment_method_id: methods[0]?.id || '', amount: 0 }])
    }
  }, [supabase])

  const loadProductsForLocation = useCallback(
    async (locationId: string, orgId: string) => {
      const { data: inventory, error } = await supabase
        .from('inventory')
        .select('quantity, product_id')
        .eq('location_id', locationId)
        .eq('organization_id', orgId)
        .gt('quantity', 0)

      if (error || !inventory || inventory.length === 0) {
        setProducts([])
        return
      }

      const groupedInventory = new Map<string, number>()
      for (const row of inventory as InventoryRow[]) {
        groupedInventory.set(
          row.product_id,
          (groupedInventory.get(row.product_id) || 0) + Number(row.quantity || 0)
        )
      }

      const inventoryRows: NormalizedInventoryRow[] = Array.from(groupedInventory.entries()).map(
        ([productId, quantity]) => ({
          product_id: productId,
          quantity,
        })
      )

      const productIds = inventoryRows.map((inv) => inv.product_id)

      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, name, sku, sale_price, currency, unit')
        .in('id', productIds)
        .eq('organization_id', orgId)
        .eq('is_active', true)

      if (productsError || !productsData) {
        setProducts([])
        return
      }

      const productRows = productsData as ProductRow[]
      const withStock: ProductWithStock[] = productRows.map((product) => {
        const inv = inventoryRows.find((i) => i.product_id === product.id)
        return {
          ...product,
          available_quantity: Number(inv?.quantity || 0),
        }
      })
      .filter((product) => product.available_quantity > 0)

      withStock.sort((a, b) => a.name.localeCompare(b.name, 'ru'))

      setProducts(withStock)
    },
    [supabase]
  )

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [authLoading, router, user])

  useEffect(() => {
    if (!user) return

    const run = async () => {
      try {
        setLoading(true)
        const resolvedOrgId = await resolveOrganizationId(supabase, organizationId)
        setActiveOrgId(resolvedOrgId)
        await Promise.all([fetchSales(resolvedOrgId), fetchReferenceData(resolvedOrgId)])
        if (selectedLocation) {
          await loadProductsForLocation(selectedLocation, resolvedOrgId)
        }
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [fetchReferenceData, fetchSales, organizationId, supabase, user])

  useEffect(() => {
    if (!selectedLocation || !activeOrgId) {
      setProducts([])
      return
    }

    void loadProductsForLocation(selectedLocation, activeOrgId)
  }, [activeOrgId, loadProductsForLocation, selectedLocation])

  const handleLocationChange = useCallback(
    (value: string | null) => {
      const nextValue = value || ''
      setSelectedLocation(nextValue)
      setSaleItems([{ product_id: '', quantity: 1, price: 0, currency: 'UZS' }])
      setPaymentItems([{ payment_method_id: paymentMethods[0]?.id || '', amount: 0 }])
      setSearchQuery('')
      setShowSearchSuggestions(false)
      if (nextValue && activeOrgId) {
        loadProductsForLocation(nextValue, activeOrgId)
      } else {
        setProducts([])
      }
    },
    [activeOrgId, loadProductsForLocation, paymentMethods]
  )

  const addSaleItem = useCallback(() => {
    setSaleItems((prev) => [...prev, { product_id: '', quantity: 1, price: 0, currency: 'UZS' }])
  }, [])

  const updateSaleItem = useCallback(
    (index: number, field: keyof SaleItemForm, value: string | number) => {
      setSaleItems((prev) => {
        const copy = [...prev]
        const current = { ...copy[index] }

        if (field === 'product_id' && typeof value === 'string') {
          current.product_id = value
          const product = products.find((p) => p.id === value)
          if (product) {
            current.price = product.sale_price
            current.currency = product.currency
          }
        }

        if (field === 'quantity' && typeof value === 'number') {
          current.quantity = value
        }
        if (field === 'price' && typeof value === 'number') {
          current.price = value
        }

        copy[index] = current
        return copy
      })
    },
    [products]
  )

  const removeSaleItem = useCallback((index: number) => {
    setSaleItems((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const addPaymentItem = useCallback(() => {
    setPaymentItems((prev) => [
      ...prev,
      {
        payment_method_id: paymentMethods[0]?.id || '',
        amount: 0,
      },
    ])
  }, [paymentMethods])

  const updatePaymentItem = useCallback((index: number, field: keyof PaymentFormItem, value: string | number) => {
    setPaymentItems((prev) => {
      const copy = [...prev]
      const current = { ...copy[index] }

      if (field === 'payment_method_id' && typeof value === 'string') {
        current.payment_method_id = value
      }
      if (field === 'amount' && typeof value === 'number') {
        current.amount = value
      }

      copy[index] = current
      return copy
    })
  }, [])

  const removePaymentItem = useCallback((index: number) => {
    setPaymentItems((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleSaleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setSaleError('')

      const itemValidation = validateSaleItems(saleItems, products)
      if (!itemValidation.valid) {
        setSaleError(itemValidation.error || 'Проверьте товары')
        return
      }

      const paymentValidation = validatePayments(
        paymentItems,
        paymentMethods,
        saleTotal,
        selectedCustomer,
        customers
      )

      if (!paymentValidation.valid) {
        setSaleError(paymentValidation.error || 'Проверьте оплаты')
        return
      }

      const validItems = saleItems
        .filter((item) => item.product_id && item.quantity > 0)
        .map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price,
        }))

      const validPayments = paymentItems
        .filter((payment) => payment.payment_method_id && payment.amount > 0)
        .map((payment) => ({
          payment_method_id: payment.payment_method_id,
          amount: payment.amount,
        }))

      setSaleLoading(true)

      try {
        const authResult = await supabase.auth.getUser()
        const currentUser = authResult.data.user
        if (!currentUser) {
          throw new Error('Не авторизован')
        }

        const orgId = activeOrgId || (await resolveOrganizationId(supabase, organizationId))

        const rpcResult = await supabase.rpc('create_sale_with_payments', {
          org_id: orgId,
          user_id_param: currentUser.id,
          location_id_param: selectedLocation,
          customer_id_param: selectedCustomer || null,
          items: validItems,
          payments: validPayments,
          notes_param: saleNotes || null,
          due_date_param: dueDate || null,
        })

        if (rpcResult.error) {
          throw new Error(rpcResult.error.message)
        }

        const result = rpcResult.data as { success?: boolean; error?: string } | null
        if (!result?.success) {
          throw new Error(result?.error || 'Ошибка создания продажи')
        }

        await fetchSales(orgId)
        setShowSaleForm(false)
        resetSaleForm()
      } catch (submitError) {
        const message = submitError instanceof Error ? submitError.message : 'Ошибка при создании продажи'
        setSaleError(message)
      } finally {
        setSaleLoading(false)
      }
    },
    [
      customers,
      dueDate,
      fetchSales,
      paymentItems,
      paymentMethods,
      products,
      resetSaleForm,
      saleItems,
      saleNotes,
      saleTotal,
      selectedCustomer,
      selectedLocation,
      activeOrgId,
      organizationId,
      supabase,
    ]
  )

  const filteredProducts = searchQuery
    ? products.filter(
        (product) =>
          product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          product.sku.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : products

  const suggestions = useMemo<SearchSuggestion[]>(() => {
    const query = searchQuery.trim().toLowerCase()
    if (query.length < 2) {
      return []
    }

    return filteredProducts.slice(0, 8).map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      available_quantity: product.available_quantity,
      unit: product.unit,
    }))
  }, [filteredProducts, searchQuery])

  const applySuggestionToCurrentRow = useCallback(
    (suggestionId: string) => {
      const targetIndex = saleItems.findIndex((item) => !item.product_id)
      const useIndex = targetIndex >= 0 ? targetIndex : 0
      updateSaleItem(useIndex, 'product_id', suggestionId)
      setShowSearchSuggestions(false)
      setSearchQuery('')
    },
    [saleItems, updateSaleItem]
  )

  const hideSuggestions = useCallback(() => {
    setTimeout(() => {
      setShowSearchSuggestions(false)
    }, 120)
  }, [])

  const toggleSale = useCallback((id: string) => {
    setExpandedSale((prev) => (prev === id ? null : id))
  }, [])

  const totalRevenue = useMemo(
    () => sales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0),
    [sales]
  )

  const totalItems = useMemo(
    () =>
      sales.reduce(
        (sum, sale) =>
          sum +
          sale.transaction_items.reduce((inner, item) => inner + Number(item.quantity || 0), 0),
        0
      ),
    [sales]
  )

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Загрузка...</div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Продажи</h1>
          <p className="mt-2 text-muted-foreground">История продаж и новая продажа</p>
        </div>
        <Button
          onClick={() => {
            if (showSaleForm) {
              setShowSaleForm(false)
              resetSaleForm()
            } else {
              setShowSaleForm(true)
            }
          }}
        >
          <ShoppingCart className="w-4 h-4 mr-1" /> {showSaleForm ? 'Закрыть' : 'Новая продажа'}
        </Button>
      </div>

      {showSaleForm && (
        <Card>
          <CardHeader>
            <CardTitle>Новая продажа</CardTitle>
            <CardDescription>Смешанные оплаты поддерживаются. Недоплата автоматически уходит в долг клиента.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaleSubmit} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Локация *</Label>
                  <Select value={selectedLocation} onValueChange={handleLocationChange}>
                    <SelectTrigger>
                      <span className={selectedLocation ? '' : 'text-muted-foreground'}>
                        {selectedLocation
                          ? `${selectedLocationData?.name || 'Локация'} (${selectedLocationType === 'warehouse' ? 'Склад' : 'Магазин'})`
                          : 'Выберите локацию'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name} ({location.type === 'warehouse' ? 'Склад' : 'Магазин'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Клиент (для истории и долгов)</Label>
                    <Select
                      value={selectedCustomer}
                      onValueChange={(value) =>
                        setSelectedCustomer(!value || value === 'none' ? '' : value)
                      }
                    >
                      <SelectTrigger>
                        <span className={selectedCustomer ? '' : 'text-muted-foreground'}>
                          {selectedCustomerData ? `${selectedCustomerData.full_name}${selectedCustomerData.phone ? ` (${selectedCustomerData.phone})` : ''}` : 'Без клиента'}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Без клиента</SelectItem>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                          {customer.full_name}
                          {customer.phone ? ` (${customer.phone})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {outstandingAmount > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="due-date">Срок погашения долга</Label>
                  <Input
                    id="due-date"
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </div>
              )}

              {selectedLocation && (
                <>
                  <div className="space-y-2">
                    <div className="relative">
                      <div className="flex items-center gap-2">
                        <Search className="w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Поиск товара по названию или артикулу"
                          value={searchQuery}
                          onFocus={() => setShowSearchSuggestions(true)}
                          onBlur={hideSuggestions}
                          onChange={(event) => {
                            setSearchQuery(event.target.value)
                            setShowSearchSuggestions(true)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              setShowSearchSuggestions(false)
                            }
                          }}
                        />
                      </div>

                      {showSearchSuggestions && searchQuery.trim().length >= 2 && (
                        <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover shadow-md">
                          {suggestions.length > 0 ? (
                            <div className="max-h-56 overflow-auto py-1">
                              {suggestions.map((suggestion) => (
                                <button
                                  key={suggestion.id}
                                  type="button"
                                  onClick={() => applySuggestionToCurrentRow(suggestion.id)}
                                  className="w-full px-3 py-2 text-left hover:bg-muted text-sm"
                                >
                                  <div className="font-medium">{suggestion.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {suggestion.sku} • {suggestion.available_quantity} {suggestion.unit}
                                  </div>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="px-3 py-2 text-sm text-muted-foreground">
                              По запросу товары не найдены
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Найдено товаров: {filteredProducts.length}
                    </p>

                    {searchQuery.trim().length >= 2 && (
                      <Card className="mt-2">
                        <CardHeader>
                          <CardTitle className="text-sm">Результаты поиска</CardTitle>
                          <CardDescription>
                            Нажмите на товар, чтобы добавить его в строку продажи
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {suggestions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">По запросу товары не найдены</p>
                          ) : (
                            <div className="space-y-1">
                              {suggestions.map((suggestion) => (
                                <button
                                  key={`search-result-${suggestion.id}`}
                                  type="button"
                                  onClick={() => applySuggestionToCurrentRow(suggestion.id)}
                                  className="w-full rounded border px-3 py-2 text-left hover:bg-muted"
                                >
                                  <div className="font-medium text-sm">{suggestion.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {suggestion.sku} • {suggestion.available_quantity} {suggestion.unit}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Товары</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addSaleItem}>
                        + Добавить товар
                      </Button>
                    </div>

                    {saleItems.map((item, index) => (
                      <div key={`${item.product_id}-${index}`} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-12 md:col-span-5 space-y-2">
                          <Label className="text-xs">Товар</Label>
                          <Select
                            value={item.product_id}
                            onValueChange={(value) =>
                              updateSaleItem(index, 'product_id', value || '')
                            }
                          >
                            <SelectTrigger>
                              <span className={item.product_id ? '' : 'text-muted-foreground'}>
                                {item.product_id
                                  ? productLabelById.get(item.product_id) || 'Товар'
                                  : 'Выберите товар'}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {filteredProducts.length === 0 && (
                                <SelectItem value="__no_product_match" disabled>
                                  По запросу товары не найдены
                                </SelectItem>
                              )}
                              {filteredProducts.map((product) => (
                                <SelectItem
                                  key={product.id}
                                  value={product.id}
                                  disabled={product.available_quantity <= 0}
                                >
                                  {product.name} ({product.sku}) - {product.available_quantity} {product.unit}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="col-span-4 md:col-span-2 space-y-2">
                          <Label className="text-xs">Кол-во</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={item.quantity}
                            onChange={(event) =>
                              updateSaleItem(index, 'quantity', Number(event.target.value || 0))
                            }
                            required
                          />
                        </div>

                        <div className="col-span-4 md:col-span-2 space-y-2">
                          <Label className="text-xs">Цена</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.price}
                            onChange={(event) =>
                              updateSaleItem(index, 'price', Number(event.target.value || 0))
                            }
                            required
                          />
                        </div>

                        <div className="col-span-3 md:col-span-2 space-y-2">
                          <Label className="text-xs">Сумма</Label>
                          <Input type="text" value={`${(item.quantity * item.price).toFixed(2)}`} disabled />
                        </div>

                        <div className="col-span-1">
                          {saleItems.length > 1 && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => removeSaleItem(index)}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <Label>Оплаты</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addPaymentItem}>
                        + Добавить оплату
                      </Button>
                    </div>

                    {paymentItems.map((payment, index) => (
                      <div key={`${payment.payment_method_id}-${index}`} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-8 md:col-span-8 space-y-2">
                          <Label className="text-xs">Тип оплаты</Label>
                          <Select
                            value={payment.payment_method_id}
                            onValueChange={(value) =>
                              updatePaymentItem(index, 'payment_method_id', value || '')
                            }
                          >
                            <SelectTrigger>
                              <span className={payment.payment_method_id ? '' : 'text-muted-foreground'}>
                                {payment.payment_method_id
                                  ? paymentMethodNameById.get(payment.payment_method_id) || 'Тип оплаты'
                                  : 'Выберите тип оплаты'}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {paymentMethods.map((method) => (
                                <SelectItem key={method.id} value={method.id}>
                                  {method.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="col-span-3 md:col-span-3 space-y-2">
                          <Label className="text-xs">Сумма</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={payment.amount}
                            onChange={(event) =>
                              updatePaymentItem(index, 'amount', Number(event.target.value || 0))
                            }
                          />
                        </div>

                        <div className="col-span-1">
                          {paymentItems.length > 1 && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => removePaymentItem(index)}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border p-3 bg-muted/20 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Итого продажа</span>
                      <span className="font-semibold">
                        {saleTotal.toFixed(2)} {saleItems[0]?.currency || 'UZS'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Оплачено</span>
                      <span className="font-semibold">
                        {paidTotal.toFixed(2)} {saleItems[0]?.currency || 'UZS'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>В долг</span>
                      <span className={`font-semibold ${outstandingAmount > 0 ? 'text-[#F2994A]' : 'text-[#27AE60]'}`}>
                        {outstandingAmount.toFixed(2)} {saleItems[0]?.currency || 'UZS'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sale-notes">Примечание</Label>
                    <Textarea
                      id="sale-notes"
                      value={saleNotes}
                      onChange={(event) => setSaleNotes(event.target.value)}
                      placeholder="Дополнительная информация"
                      rows={2}
                    />
                  </div>

                  {saleError && <div className="text-sm text-red-600 bg-red-50 p-3 rounded">{saleError}</div>}

                  <div className="flex gap-4">
                    <Button type="submit" disabled={saleLoading}>
                      {saleLoading ? 'Создание...' : 'Продать'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowSaleForm(false)
                        resetSaleForm()
                      }}
                    >
                      Отмена
                    </Button>
                  </div>
                </>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Всего продаж</CardDescription>
            <CardTitle className="text-3xl">{sales.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Количество транзакций</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Общая выручка</CardDescription>
            <CardTitle className="text-3xl">
              {totalRevenue.toFixed(0)} {sales[0]?.currency || 'UZS'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Сумма всех продаж</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Продано товаров</CardDescription>
            <CardTitle className="text-3xl">{totalItems}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Единиц товара</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Все продажи</CardTitle>
          <CardDescription>Нажмите на продажу для просмотра деталей</CardDescription>
        </CardHeader>
        <CardContent>
          {sales.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">Нет продаж</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sales.map((sale) => {
                const customer = firstRelation(sale.customers)

                return (
                  <div key={sale.id} className="border rounded-lg overflow-hidden">
                    <div
                      onClick={() => toggleSale(sale.id)}
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Badge className={getTransactionTypeBadgeColor(sale.type)}>
                          {getTransactionTypeLabel(sale.type)}
                        </Badge>
                        <p className="text-sm text-muted-foreground">
                          {new Date(sale.created_at).toLocaleDateString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-semibold">
                            {sale.total_amount.toFixed(2)} {sale.currency || 'UZS'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {sale.locations_from?.name || '-'}
                          </p>
                        </div>
                        <span className="text-muted-foreground">{expandedSale === sale.id ? '▼' : '▶'}</span>
                      </div>
                    </div>

                    {expandedSale === sale.id && (
                      <div className="bg-muted/30 p-4 border-t space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Дата:</p>
                            <p className="font-medium">{new Date(sale.created_at).toLocaleString('ru-RU')}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Локация:</p>
                            <p className="font-medium">{sale.locations_from?.name || '-'}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Клиент:</p>
                            <p className="font-medium">
                              {customer ? `${customer.full_name}${customer.phone ? ` (${customer.phone})` : ''}` : 'Без клиента'}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Сумма:</p>
                            <p className="font-medium text-lg">
                              {sale.total_amount.toFixed(2)} {sale.currency || 'UZS'}
                            </p>
                          </div>
                        </div>

                        {sale.notes && (
                          <div className="text-sm">
                            <p className="text-muted-foreground">Примечание:</p>
                            <p className="font-medium">{sale.notes}</p>
                          </div>
                        )}

                        {(sale.sale_payments?.length ?? 0) > 0 && (
                          <div>
                            <p className="text-sm font-medium mb-2">Оплаты:</p>
                            <div className="space-y-2">
                              {(sale.sale_payments || []).map((payment, index) => {
                                const method = firstRelation(payment.payment_methods)
                                return (
                                  <div key={`${sale.id}-payment-${index}`} className="flex justify-between items-center bg-card p-2 rounded border">
                                    <p className="text-sm font-medium">{method?.name || 'Тип оплаты'}</p>
                                    <p className="text-sm font-medium">
                                      {Number(payment.amount || 0).toFixed(2)} {sale.currency}
                                    </p>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {(sale.transaction_items?.length ?? 0) > 0 && (
                          <div>
                            <p className="text-sm font-medium mb-2">Товары:</p>
                            <div className="space-y-2">
                              {(sale.transaction_items || []).map((item, index) => {
                                const product = firstRelation(item.products)
                                return (
                                  <div key={`${sale.id}-item-${index}`} className="flex justify-between items-center bg-card p-3 rounded border">
                                    <div>
                                      <p className="font-medium">{product?.name || 'Товар'}</p>
                                      <p className="text-sm text-muted-foreground">Артикул: {product?.sku || '-'}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-medium">
                                        {item.quantity} шт x {item.price} {item.currency}
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        Итого: {(item.quantity * item.price).toFixed(2)} {item.currency}
                                      </p>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
