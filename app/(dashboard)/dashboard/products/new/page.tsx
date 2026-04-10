'use client'

import { useEffect, useState } from 'react'
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

interface Product {
  id: string
  name: string
  sku: string
  purchase_price: number
  sale_price: number
  currency: string
  unit: string
  description: string | null
}

interface Location {
  id: string
  name: string
  type: string
}

export default function NewProductPage() {
  const router = useRouter()
  const { user, loading: authLoading, organizationId } = useAuth()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    unit: 'шт',
    purchase_price: '',
    sale_price: '',
    currency: 'UZS',
    quantity: '',
    location_id: '',
    min_stock_level: '0',
  })

  const selectedLocation = locations.find((loc) => loc.id === formData.location_id)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [authLoading, router, user])

  useEffect(() => {
    if (user) {
      fetchProducts()
      fetchLocations()
    }
  }, [user])

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching products:', error)
      return
    }

    if (data) setProducts(data)
  }

  const fetchLocations = async () => {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .order('name')

    if (error) {
      console.error('Error fetching locations:', error)
      return
    }

    if (data) setLocations(data)
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setFormData({ ...formData, name: value })
    if (value.length >= 2) {
      const filtered = products.filter(p => p.name.toLowerCase().includes(value.toLowerCase()))
      setFilteredProducts(filtered)
      setShowSuggestions(filtered.length > 0)
    } else {
      setShowSuggestions(false)
    }
  }

  const selectProduct = (product: Product) => {
    setSelectedProduct(product)
    setFormData({
      ...formData,
      name: product.name,
      description: product.description || '',
      unit: product.unit,
      purchase_price: product.purchase_price.toString(),
      sale_price: product.sale_price.toString(),
      currency: product.currency,
    })
    setShowSuggestions(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleCurrencyChange = (value: string | null) => {
    setFormData({ ...formData, currency: value || 'UZS' })
  }

  const handleLocationChange = (value: string | null) => {
    setFormData({ ...formData, location_id: value || '' })
  }

  const generateSKU = async () => {
    const { data } = await supabase.from('products').select('sku').order('created_at', { ascending: false }).limit(1)
    if (data && data.length > 0) {
      const match = data[0].sku.match(/PROD-(\d+)/)
      if (match) {
        const num = parseInt(match[1]) + 1
        return `PROD-${num.toString().padStart(3, '0')}`
      }
    }
    return 'PROD-001'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!user) {
        throw new Error('Пользователь не авторизован')
      }

      const orgId = await resolveOrganizationId(supabase, organizationId)

      let productId = selectedProduct?.id

      if (!selectedProduct) {
        const sku = await generateSKU()
        const { data: newProduct, error: productError } = await supabase
          .from('products')
          .insert({
            organization_id: orgId,
            sku,
            name: formData.name,
            description: formData.description || null,
            unit: formData.unit,
            purchase_price: parseFloat(formData.purchase_price),
            sale_price: parseFloat(formData.sale_price),
            currency: formData.currency,
            min_stock_level: parseInt(formData.min_stock_level),
          })
          .select()
          .single()

        if (productError) throw productError
        productId = newProduct.id
      }

      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert({
          organization_id: orgId,
          type: 'arrival',
          to_location_id: formData.location_id,
          user_id: user.id,
          total_amount: parseFloat(formData.quantity) * parseFloat(formData.purchase_price),
          currency: formData.currency,
          notes: `Приход товара: ${formData.name}`,
        })
        .select()
        .single()

      if (transactionError) throw transactionError

      await supabase.from('transaction_items').insert({
        transaction_id: transaction.id,
        product_id: productId,
        quantity: parseFloat(formData.quantity),
        price: parseFloat(formData.purchase_price),
        currency: formData.currency,
        total: parseFloat(formData.quantity) * parseFloat(formData.purchase_price),
      })

      const { data: existingInventory } = await supabase
        .from('inventory')
        .select('*')
        .eq('product_id', productId)
        .eq('location_id', formData.location_id)
        .single()

      if (existingInventory) {
        await supabase.from('inventory')
          .update({ quantity: existingInventory.quantity + parseFloat(formData.quantity) })
          .eq('id', existingInventory.id)
      } else {
        await supabase.from('inventory').insert({
          organization_id: orgId,
          product_id: productId,
          location_id: formData.location_id,
          quantity: parseFloat(formData.quantity),
        })
      }

      router.push('/dashboard/products')
    } catch (err: any) {
      setError(err.message || 'Ошибка при добавлении товара')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Добавить товар (Приход)</h1>
        <p className="mt-2 text-muted-foreground">Добавление нового товара и приход на склад</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Информация о товаре</CardTitle>
          <CardDescription>Заполните данные о товаре и укажите количество для прихода</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2 relative">
              <Label htmlFor="name">Название товара *</Label>
              <Input
                id="name" name="name" value={formData.name} onChange={handleNameChange}
                onFocus={() => formData.name.length >= 2 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                required placeholder="Начните вводить название..." autoComplete="off"
              />
              {showSuggestions && filteredProducts.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                  {filteredProducts.map((product) => (
                    <div key={product.id} className="px-4 py-2 hover:bg-gray-100 cursor-pointer" onMouseDown={() => selectProduct(product)}>
                      <div className="font-medium">{product.name}</div>
                      <div className="text-sm text-gray-500">{product.sku} • {product.purchase_price} {product.currency}</div>
                    </div>
                  ))}
                </div>
              )}
              {selectedProduct && (
                <p className="text-sm text-[#27AE60]">✓ Выбран существующий товар. Можете изменить цены.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit">Единица измерения *</Label>
                <Input id="unit" name="unit" value={formData.unit} onChange={handleChange} required placeholder="шт, кг, л" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Валюта *</Label>
                <Select value={formData.currency} onValueChange={handleCurrencyChange}>
                  <SelectTrigger><SelectValue placeholder="Выберите валюту" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UZS">UZS (Узбекский сум)</SelectItem>
                    <SelectItem value="USD">USD (Доллар США)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Textarea id="description" name="description" value={formData.description} onChange={handleChange} placeholder="Описание товара" rows={3} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="purchase_price">Цена закупки *</Label>
                <Input id="purchase_price" name="purchase_price" type="number" step="0.01" min="0" value={formData.purchase_price} onChange={handleChange} required placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sale_price">Цена продажи *</Label>
                <Input id="sale_price" name="sale_price" type="number" step="0.01" min="0" value={formData.sale_price} onChange={handleChange} required placeholder="0.00" />
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="text-lg font-medium mb-4">Приход на склад/магазин</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location_id">Локация *</Label>
                  <Select value={formData.location_id} onValueChange={handleLocationChange}>
                    <SelectTrigger>
                      <span className={selectedLocation ? '' : 'text-muted-foreground'}>
                        {selectedLocation
                          ? `${selectedLocation.name} (${selectedLocation.type === 'warehouse' ? 'Склад' : 'Магазин'})`
                          : 'Выберите локацию'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {locations.length === 0 ? (
                        <SelectItem value="__no_locations" disabled>
                          Нет локаций
                        </SelectItem>
                      ) : (
                        locations.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>
                            {loc.name} ({loc.type === 'warehouse' ? 'Склад' : 'Магазин'})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {locations.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Сначала создайте локацию в разделе "Локации".
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantity">Количество *</Label>
                  <Input id="quantity" name="quantity" type="number" step="0.01" min="0.01" value={formData.quantity} onChange={handleChange} required placeholder="0" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="min_stock_level">Минимальный остаток</Label>
              <Input id="min_stock_level" name="min_stock_level" type="number" min="0" value={formData.min_stock_level} onChange={handleChange} placeholder="0" />
              <p className="text-sm text-muted-foreground">Уведомление при достижении этого уровня</p>
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}

            <div className="flex gap-4">
              <Button type="submit" disabled={loading || locations.length === 0 || !formData.location_id}>
                {loading ? 'Добавление...' : 'Добавить товар'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>Отмена</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
