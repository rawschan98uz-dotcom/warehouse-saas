'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context'
import { createClient } from '@/lib/supabase/client'
import { resolveOrganizationId } from '@/lib/org/resolve-org-id'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Plus, X } from 'lucide-react'

interface Product {
  id: string
  name: string
  sku: string
  purchase_price: number
  sale_price: number
  currency: string
}

interface Location {
  id: string
  name: string
  type: string
}

interface TransactionItem {
  product_id: string
  quantity: number
  price: number
  currency: string
  product_name?: string
}

const TRANSACTION_TYPE_LABEL: Record<'arrival' | 'transfer' | 'expense', string> = {
  arrival: 'Приход товара',
  transfer: 'Перевод между локациями',
  expense: 'Расход/Списание',
}

export default function NewTransactionPage() {
  const router = useRouter()
  const { user, loading: authLoading, organizationId } = useAuth()
  const supabase = createClient()
  const [activeOrgId, setActiveOrgId] = useState('')
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [transactionType, setTransactionType] = useState<'arrival' | 'transfer' | 'expense'>('arrival')
  const [selectedLocation, setSelectedLocation] = useState('')
  const [fromLocation, setFromLocation] = useState('')
  const [toLocation, setToLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<TransactionItem[]>([
    { product_id: '', quantity: 0, price: 0, currency: 'UZS' }
  ])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [authLoading, router, user])

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Загрузка...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const selectedLocationName =
    locations.find((loc) => loc.id === selectedLocation)?.name || ''

  const fromLocationName =
    locations.find((loc) => loc.id === fromLocation)?.name || ''

  const toLocationName =
    locations.find((loc) => loc.id === toLocation)?.name || ''

  const productNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const product of products) {
      map.set(product.id, `${product.name} (${product.sku})`)
    }
    return map
  }, [products])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [authLoading, router, user])

  useEffect(() => {
    if (!user) return

    const run = async () => {
      try {
        const orgId = await resolveOrganizationId(supabase, organizationId)
        setActiveOrgId(orgId)
        await Promise.all([fetchProducts(orgId), fetchLocations(orgId)])
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Организация не найдена')
      }
    }

    run()
  }, [organizationId, supabase, user])

  const fetchProducts = async (orgId: string) => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name')

    setProducts(data || [])
  }

  const fetchLocations = async (orgId: string) => {
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('organization_id', orgId)
      .order('name')

    setLocations(data || [])
  }

  const addItem = () => {
    setItems([...items, { product_id: '', quantity: 0, price: 0, currency: 'UZS' }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: keyof TransactionItem, value: any) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    if (field === 'product_id') {
      const product = products.find(p => p.id === value)
      if (product) {
        newItems[index].price = product.purchase_price
        newItems[index].currency = product.currency
        newItems[index].product_name = product.name
      }
    }
    setItems(newItems)
  }

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity * item.price), 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const orgId = activeOrgId || (await resolveOrganizationId(supabase, organizationId))

      if (transactionType === 'transfer' && fromLocation === toLocation) {
        throw new Error('Локации "Откуда" и "Куда" должны отличаться')
      }

      const validItems = items.filter((item) => item.product_id && item.quantity > 0)
      if (validItems.length === 0) {
        throw new Error('Добавьте хотя бы один товар с количеством больше нуля')
      }

      const transactionData: any = {
        organization_id: orgId,
        type: transactionType,
        user_id: user?.id,
        total_amount: calculateTotal(),
        notes: notes || null,
      }

      if (transactionType === 'transfer') {
        transactionData.from_location_id = fromLocation
        transactionData.to_location_id = toLocation
      } else if (transactionType === 'arrival') {
        transactionData.to_location_id = selectedLocation
      } else if (transactionType === 'expense') {
        transactionData.from_location_id = selectedLocation
      }

      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert(transactionData)
        .select()
        .single()

      if (transactionError) throw transactionError

      const transactionItems = validItems.map(item => ({
        transaction_id: transaction.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.price,
        currency: item.currency,
        total: item.quantity * item.price,
      }))

      const { error: itemsError } = await supabase.from('transaction_items').insert(transactionItems)
      if (itemsError) throw itemsError

      for (const item of validItems) {
        if (transactionType === 'arrival') {
          await updateInventory(orgId, item.product_id, selectedLocation, item.quantity)
        } else if (transactionType === 'expense') {
          await updateInventory(orgId, item.product_id, selectedLocation, -item.quantity)
        } else if (transactionType === 'transfer') {
          await updateInventory(orgId, item.product_id, fromLocation, -item.quantity)
          await updateInventory(orgId, item.product_id, toLocation, item.quantity)
        }
      }

      router.push('/dashboard/transactions')
    } catch (err: any) {
      setError(err.message || 'Ошибка при создании транзакции')
    } finally {
      setLoading(false)
    }
  }

  const updateInventory = async (orgId: string, productId: string, locationId: string, quantityChange: number) => {
    const { data: existing } = await supabase
      .from('inventory')
      .select('*')
      .eq('product_id', productId)
      .eq('location_id', locationId)
      .single()

    if (existing) {
      await supabase.from('inventory').update({ quantity: existing.quantity + quantityChange }).eq('id', existing.id)
    } else {
      await supabase.from('inventory').insert({
        organization_id: orgId,
        product_id: productId,
        location_id: locationId,
        quantity: quantityChange,
      })
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Новая транзакция</h1>
        <p className="mt-2 text-muted-foreground">Создание операции со складом</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Информация о транзакции</CardTitle>
          <CardDescription>Заполните данные о новой операции</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="type">Тип операции *</Label>
              <Select
                value={transactionType}
                onValueChange={(value) =>
                  setTransactionType((value as 'arrival' | 'transfer' | 'expense') || 'arrival')
                }
              >
                <SelectTrigger>
                  <span>{TRANSACTION_TYPE_LABEL[transactionType]}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="arrival">Приход товара</SelectItem>
                  <SelectItem value="transfer">Перевод между локациями</SelectItem>
                  <SelectItem value="expense">Расход/Списание</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {transactionType === 'transfer' ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Откуда *</Label>
                  <Select value={fromLocation} onValueChange={(value) => setFromLocation(value || '')}>
                    <SelectTrigger>
                      <span className={fromLocation ? '' : 'text-muted-foreground'}>
                        {fromLocation ? fromLocationName || 'Локация' : 'Выберите локацию'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Куда *</Label>
                  <Select value={toLocation} onValueChange={(value) => setToLocation(value || '')}>
                    <SelectTrigger>
                      <span className={toLocation ? '' : 'text-muted-foreground'}>
                        {toLocation ? toLocationName || 'Локация' : 'Выберите локацию'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>{transactionType === 'arrival' ? 'Локация (куда) *' : 'Локация (откуда) *'}</Label>
                <Select value={selectedLocation} onValueChange={(value) => setSelectedLocation(value || '')}>
                  <SelectTrigger>
                    <span className={selectedLocation ? '' : 'text-muted-foreground'}>
                      {selectedLocation ? selectedLocationName || 'Локация' : 'Выберите локацию'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label>Товары *</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="w-3 h-3 mr-1" /> Добавить товар</Button>
              </div>

              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5 space-y-2">
                    <Label className="text-xs">Товар</Label>
                    <Select
                      value={item.product_id}
                      onValueChange={(value) => updateItem(index, 'product_id', value || '')}
                    >
                      <SelectTrigger>
                        <span className={item.product_id ? '' : 'text-muted-foreground'}>
                          {item.product_id ? productNameById.get(item.product_id) || 'Товар' : 'Выберите товар'}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name} ({product.sku})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label className="text-xs">Количество</Label>
                    <Input type="number" step="0.01" min="0" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value))} required />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label className="text-xs">Цена</Label>
                    <Input type="number" step="0.01" min="0" value={item.price} onChange={(e) => updateItem(index, 'price', parseFloat(e.target.value))} required />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label className="text-xs">Сумма</Label>
                    <Input type="text" value={`${(item.quantity * item.price).toFixed(2)} ${item.currency}`} disabled />
                  </div>
                  <div className="col-span-1">
                    {items.length > 1 && <Button type="button" variant="destructive" size="icon" className="h-8 w-8" onClick={() => removeItem(index)}><X className="w-3 h-3" /></Button>}
                  </div>
                </div>
              ))}

              <div className="flex justify-end text-lg font-semibold">Итого: {calculateTotal().toFixed(2)} {items[0]?.currency || 'UZS'}</div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Примечание</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Дополнительная информация" rows={3} />
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>{loading ? 'Создание...' : 'Создать транзакцию'}</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>Отмена</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
