'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { getTransactionTypeLabel, getTransactionTypeBadgeColor } from '@/lib/utils/transaction-utils'

interface Location {
  id: string
  name: string
  type: 'warehouse' | 'store'
  address: string | null
  created_at: string
}

interface LocationInventory {
  product_id: string
  quantity: number
  products:
    | { name: string; sku: string; purchase_price: number; sale_price: number; currency: string; unit: string }
    | Array<{ name: string; sku: string; purchase_price: number; sale_price: number; currency: string; unit: string }>
    | null
}

interface LocationTransaction {
  id: string
  type: string
  total_amount: number
  currency: string
  created_at: string
  notes: string | null
  from_location_id: string | null
  to_location_id: string | null
  transaction_items: Array<{
    quantity: number
    price: number
    currency: string
    products: { name: string; sku: string } | Array<{ name: string; sku: string }> | null
  }>
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] || null
  return value
}

export default function LocationsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [locationInventory, setLocationInventory] = useState<LocationInventory[]>([])
  const [locationTransactions, setLocationTransactions] = useState<LocationTransaction[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [expandedTx, setExpandedTx] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.push('/login')
  }, [user, authLoading, router])

  useEffect(() => {
    if (user) fetchLocations()
  }, [user])

  const fetchLocations = async () => {
    try {
      const { data, error } = await supabase.from('locations').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setLocations(data || [])
    } catch (error) {
      console.error('Error fetching locations:', error)
    } finally {
      setLoading(false)
    }
  }

  const selectLocation = async (locationId: string) => {
    setSelectedLocation(locationId)
    setSearchQuery('')
    setFilterType('all')

    const { data: inv } = await supabase
      .from('inventory')
      .select(`product_id, quantity, products(name, sku, purchase_price, sale_price, currency, unit)`)
      .eq('location_id', locationId)
    setLocationInventory((inv as LocationInventory[] | null) || [])

    const { data: txs } = await supabase
      .from('transactions')
      .select(`*, transaction_items(quantity, price, currency, products(name, sku))`)
      .or(`from_location_id.eq.${locationId},to_location_id.eq.${locationId}`)
      .order('created_at', { ascending: false })
    setLocationTransactions((txs as LocationTransaction[] | null) || [])
  }

  const filteredInventory = locationInventory.filter((item) => {
    const product = firstRelation(item.products)
    if (!product) return false

    if (searchQuery === '') return true
    const query = searchQuery.toLowerCase()
    return product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query)
  })

  const filteredTransactions = locationTransactions.filter((tx) => {
    const matchesType = filterType === 'all' || tx.type === filterType
    const matchesSearch =
      searchQuery === '' ||
      tx.transaction_items?.some((item) => {
        const product = firstRelation(item.products)
        if (!product) return false
        const query = searchQuery.toLowerCase()
        return product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query)
      })
    return matchesType && matchesSearch
  })

  const getTypeLabel = (type: string) => type === 'warehouse' ? 'Склад' : 'Магазин'

  if (authLoading || loading) return <div className="flex items-center justify-center min-h-screen"><div className="text-lg">Загрузка...</div></div>
  if (!user) return null

  if (selectedLocation) {
    const loc = locations.find(l => l.id === selectedLocation)
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <Button variant="outline" size="sm" onClick={() => setSelectedLocation(null)} className="mb-2">← Назад к списку</Button>
            <h1 className="text-3xl font-bold">{loc?.name}</h1>
            <p className="mt-2 text-muted-foreground">{getTypeLabel(loc?.type || '')} {loc?.address ? `• ${loc.address}` : ''}</p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Поиск товара..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <div className="w-48">
            <Select value={filterType} onValueChange={(value) => setFilterType(value || 'all')}>
              <SelectTrigger><SelectValue placeholder="Все типы" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                <SelectItem value="arrival">Приход</SelectItem>
                <SelectItem value="sale">Продажа</SelectItem>
                <SelectItem value="transfer">Перевод</SelectItem>
                <SelectItem value="expense">Расход</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Товары на локации</CardTitle>
            <CardDescription>{filteredInventory.length} позиций</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredInventory.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Нет товаров</p>
            ) : (
              <div className="space-y-2">
                {filteredInventory.map((item, index) => (
                  (() => {
                    const product = firstRelation(item.products)
                    if (!product) return null

                    return (
                      <div
                        key={index}
                        className={`flex justify-between items-center p-3 rounded border ${item.quantity === 0 ? 'bg-red-50/50 border-red-200' : ''}`}
                      >
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-sm text-muted-foreground">Артикул: {product.sku}</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-semibold ${item.quantity === 0 ? 'text-red-600' : 'text-[#27AE60]'}`}>
                            {item.quantity} {product.unit}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {product.purchase_price} / {product.sale_price} {product.currency}
                          </p>
                        </div>
                      </div>
                    )
                  })()
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>История операций</CardTitle>
            <CardDescription>{filteredTransactions.length} транзакций</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredTransactions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Нет транзакций</p>
            ) : (
              <div className="space-y-2">
                {filteredTransactions.map((tx) => (
                  <div key={tx.id} className="border rounded-lg overflow-hidden">
                    <div onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)} className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Badge className={getTransactionTypeBadgeColor(tx.type)}>{getTransactionTypeLabel(tx.type)}</Badge>
                        <p className="text-sm text-muted-foreground">{new Date(tx.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="font-semibold">{tx.total_amount.toFixed(2)} {tx.currency}</p>
                        <span className="text-muted-foreground">{expandedTx === tx.id ? '▼' : '▶'}</span>
                      </div>
                    </div>
                    {expandedTx === tx.id && (tx.transaction_items?.length ?? 0) > 0 && (
                      <div className="bg-muted/30 p-4 border-t space-y-2">
                        {(tx.transaction_items || []).map((item, i) => (
                          (() => {
                            const product = firstRelation(item.products)
                            if (!product) return null

                            return (
                              <div key={i} className="flex justify-between items-center bg-card p-2 rounded">
                                <div>
                                  <p className="font-medium">{product.name}</p>
                                  <p className="text-sm text-muted-foreground">{product.sku}</p>
                                </div>
                                <p className="font-medium">{item.quantity} шт × {item.price}</p>
                              </div>
                            )
                          })()
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Локации</h1>
          <p className="mt-2 text-muted-foreground">Управление складами и магазинами</p>
        </div>
        <Link href="/dashboard/locations/new"><Button>Добавить локацию</Button></Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {locations.map((location) => (
          <Card key={location.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => selectLocation(location.id)}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <CardTitle>{location.name}</CardTitle>
                <Badge variant={location.type === 'warehouse' ? 'default' : 'secondary'}>{getTypeLabel(location.type)}</Badge>
              </div>
              {location.address && <CardDescription>{location.address}</CardDescription>}
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Нажмите для просмотра товаров и истории</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {locations.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground mb-4">Нет локаций</p>
            <Link href="/dashboard/locations/new"><Button>Добавить первую локацию</Button></Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
