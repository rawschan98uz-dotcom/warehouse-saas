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
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import Link from 'next/link'
import { Pencil, Trash2, Plus, ArrowDownUp, X } from 'lucide-react'

interface ProductBase {
  id: string
  sku: string
  name: string
  category_id: string | null
  purchase_price: number
  sale_price: number
  currency: string
  unit: string
  min_stock_level: number
  description: string | null
  created_at: string
}

interface Location {
  id: string
  name: string
  type: 'warehouse' | 'store'
}

interface InventoryRow {
  id: string
  product_id: string
  location_id: string
  quantity: number
}

interface ProductInventoryView {
  id: string
  location_id: string
  quantity: number
  locations: { name: string; type: 'warehouse' | 'store' }
}

interface ProductView extends ProductBase {
  inventory: ProductInventoryView[]
  total_quantity: number
}

interface TransferItem {
  product_id: string
  quantity: number
}

interface TransferForm {
  from: string
  to: string
  items: TransferItem[]
  notes: string
}

interface TransferItemDraft {
  quantity: string
}

function parseEditableNumber(raw: string) {
  if (raw === '') return 0
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

interface TransferProduct {
  id: string
  name: string
  sku: string
  purchase_price: number
  currency: string
}

interface LocationLookup {
  id: string
  name: string
  type: 'warehouse' | 'store'
}

export default function ProductsPage() {
  const { user, loading: authLoading, organizationId } = useAuth()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [activeOrgId, setActiveOrgId] = useState('')
  const [products, setProducts] = useState<ProductView[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLocation, setSelectedLocation] = useState<string>('all')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferError, setTransferError] = useState('')
  const [transferData, setTransferData] = useState<TransferForm>({
    from: '',
    to: '',
    items: [{ product_id: '', quantity: 0 }],
    notes: '',
  })
  const [transferItemDrafts, setTransferItemDrafts] = useState<TransferItemDraft[]>([
    { quantity: '0' },
  ])
  const [allProducts, setAllProducts] = useState<TransferProduct[]>([])

  const selectedLocationLabel =
    locations.find((location) => location.id === selectedLocation)?.name || ''

  const transferFromLabel =
    locations.find((location) => location.id === transferData.from)?.name || ''

  const transferToLabel =
    locations.find((location) => location.id === transferData.to)?.name || ''

  const productNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const product of allProducts) {
      map.set(product.id, `${product.name} (${product.sku})`)
    }
    return map
  }, [allProducts])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [authLoading, router, user])

  const fetchAllProducts = useCallback(
    async (orgId: string) => {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, purchase_price, currency')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('name')

      setAllProducts((data || []) as TransferProduct[])
    },
    [supabase]
  )

  const fetchLocations = useCallback(
    async (orgId: string) => {
      const { data } = await supabase
        .from('locations')
        .select('id, name, type')
        .eq('organization_id', orgId)
        .order('name')

      setLocations((data || []) as Location[])
    },
    [supabase]
  )

  const fetchProducts = useCallback(
    async (orgId: string) => {
      const [{ data: productsData, error: productsError }, { data: inventoryData, error: inventoryError }] =
        await Promise.all([
          supabase
            .from('products')
            .select('id, sku, name, category_id, purchase_price, sale_price, currency, unit, min_stock_level, description, created_at')
            .eq('organization_id', orgId)
            .eq('is_active', true)
            .order('created_at', { ascending: false }),
          supabase
            .from('inventory')
            .select('id, product_id, location_id, quantity')
            .eq('organization_id', orgId),
        ])

      if (productsError) {
        throw productsError
      }

      if (inventoryError) {
        throw inventoryError
      }

      const productsList = (productsData || []) as ProductBase[]
      const inventoryList = (inventoryData || []) as InventoryRow[]

      const locationMap = new Map<string, LocationLookup>()
      for (const location of locations) {
        locationMap.set(location.id, location)
      }

      const productsWithInventory: ProductView[] = productsList.map((product) => {
        const productInv = inventoryList
          .filter((inv) => inv.product_id === product.id)
          .map((inv) => ({
            id: inv.id,
            location_id: inv.location_id,
            quantity: Number(inv.quantity || 0),
            locations: {
              name: locationMap.get(inv.location_id)?.name || 'Локация',
              type: locationMap.get(inv.location_id)?.type || 'store',
            },
          }))

        const totalQty = productInv.reduce((sum, inv) => sum + Number(inv.quantity || 0), 0)
        return { ...product, inventory: productInv, total_quantity: totalQty }
      })

      setProducts(productsWithInventory)
    },
    [locations, supabase]
  )

  useEffect(() => {
    if (!user) return

    const run = async () => {
      try {
        setLoading(true)
        const orgId = await resolveOrganizationId(supabase, organizationId)
        setActiveOrgId(orgId)
        await fetchLocations(orgId)
      } catch (error) {
        console.error('Error resolving organization for products page:', error)
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [fetchLocations, organizationId, supabase, user])

  useEffect(() => {
    if (!activeOrgId) return

    const run = async () => {
      try {
        setLoading(true)
        await Promise.all([fetchAllProducts(activeOrgId), fetchProducts(activeOrgId)])
      } catch (error) {
        console.error('Error loading products data:', error)
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [activeOrgId, fetchAllProducts, fetchProducts])

  const handleDelete = useCallback(
    async (productId: string) => {
      try {
        await supabase.from('inventory').delete().eq('product_id', productId)
        await supabase.from('transaction_items').delete().eq('product_id', productId)
        await supabase.from('products').delete().eq('id', productId)
        setProducts((prev) => prev.filter((product) => product.id !== productId))
        setDeleteConfirm(null)
      } catch (error) {
        console.error('Error deleting product:', error)
      }
    },
    [supabase]
  )

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const query = searchQuery.toLowerCase().trim()
      const matchesSearch =
        query.length === 0 ||
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query)

      if (selectedLocation === 'all') return matchesSearch

      const locInv = product.inventory.find((inv) => inv.location_id === selectedLocation)
      return matchesSearch && Boolean(locInv && Number(locInv.quantity) > 0)
    })
  }, [products, searchQuery, selectedLocation])

  const grandTotalQuantity = filteredProducts.reduce((sum, product) => sum + product.total_quantity, 0)
  const grandTotalValue = filteredProducts.reduce(
    (sum, product) => sum + product.total_quantity * product.purchase_price,
    0
  )

  const addTransferItem = () => {
    setTransferData((prev) => ({
      ...prev,
      items: [...prev.items, { product_id: '', quantity: 0 }],
    }))
    setTransferItemDrafts((prev) => [...prev, { quantity: '0' }])
  }

  const updateTransferItem = (index: number, field: keyof TransferItem, value: string | number) => {
    setTransferData((prev) => {
      const nextItems = [...prev.items]
      const current = { ...nextItems[index] }

      if (field === 'product_id' && typeof value === 'string') {
        current.product_id = value
      }

      if (field === 'quantity' && typeof value === 'number') {
        current.quantity = value
      }

      nextItems[index] = current
      return {
        ...prev,
        items: nextItems,
      }
    })
  }

  const updateTransferItemDraft = (index: number, value: string) => {
    setTransferItemDrafts((prev) => {
      const next = [...prev]
      next[index] = { quantity: value }
      return next
    })
  }

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTransferError('')
    setTransferLoading(true)

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) throw new Error('Не авторизован')

      const orgId = activeOrgId || (await resolveOrganizationId(supabase, organizationId))

      if (!transferData.from || !transferData.to) {
        throw new Error('Выберите локации отправки и назначения')
      }

      if (transferData.from === transferData.to) {
        throw new Error('Локации "Откуда" и "Куда" должны отличаться')
      }

      const validItems = transferData.items.filter((item) => item.product_id && item.quantity > 0)
      if (validItems.length === 0) {
        throw new Error('Добавьте хотя бы один товар с количеством больше нуля')
      }

      let totalAmount = 0
      for (const item of validItems) {
        const { data: product } = await supabase
          .from('products')
          .select('purchase_price')
          .eq('organization_id', orgId)
          .eq('id', item.product_id)
          .single()

        if (product) {
          totalAmount += item.quantity * Number(product.purchase_price || 0)
        }
      }

      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .insert({
          organization_id: orgId,
          type: 'transfer',
          from_location_id: transferData.from,
          to_location_id: transferData.to,
          user_id: currentUser.id,
          total_amount: totalAmount,
          notes: transferData.notes || null,
        })
        .select()
        .single()

      if (txError) throw txError

      for (const item of validItems) {
        const { data: product } = await supabase
          .from('products')
          .select('purchase_price, currency')
          .eq('organization_id', orgId)
          .eq('id', item.product_id)
          .single()

        await supabase.from('transaction_items').insert({
          transaction_id: transaction.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: Number(product?.purchase_price || 0),
          currency: product?.currency || 'UZS',
          total: item.quantity * Number(product?.purchase_price || 0),
        })

        const fromInv = await supabase
          .from('inventory')
          .select('*')
          .eq('organization_id', orgId)
          .eq('product_id', item.product_id)
          .eq('location_id', transferData.from)
          .maybeSingle()

        if (fromInv.data) {
          await supabase
            .from('inventory')
            .update({ quantity: Number(fromInv.data.quantity || 0) - item.quantity })
            .eq('id', fromInv.data.id)
        }

        const toInv = await supabase
          .from('inventory')
          .select('*')
          .eq('organization_id', orgId)
          .eq('product_id', item.product_id)
          .eq('location_id', transferData.to)
          .maybeSingle()

        if (toInv.data) {
          await supabase
            .from('inventory')
            .update({ quantity: Number(toInv.data.quantity || 0) + item.quantity })
            .eq('id', toInv.data.id)
        } else {
          await supabase.from('inventory').insert({
            organization_id: orgId,
            product_id: item.product_id,
            location_id: transferData.to,
            quantity: item.quantity,
          })
        }
      }

      setShowTransfer(false)
      setTransferData({ from: '', to: '', items: [{ product_id: '', quantity: 0 }], notes: '' })
      setTransferItemDrafts([{ quantity: '0' }])
      await fetchProducts(orgId)
    } catch (err: any) {
      setTransferError(err.message || 'Ошибка')
    } finally {
      setTransferLoading(false)
    }
  }

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
          <h1 className="text-3xl font-bold">Товары</h1>
          <p className="mt-2 text-muted-foreground">Управление каталогом и остатками</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/products/import">
            <Button variant="outline">Импорт из Excel</Button>
          </Link>
          <Link href="/dashboard/products/new">
            <Button><Plus className="w-4 h-4 mr-1" /> Добавить товар</Button>
          </Link>
        </div>
      </div>

      {showTransfer && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Перевод между локациями</CardTitle>
                <CardDescription>Перемещение товаров с одной локации на другую</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowTransfer(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Откуда *</Label>
                  <Select
                    value={transferData.from}
                    onValueChange={(v) => setTransferData((prev) => ({ ...prev, from: v || '' }))}
                  >
                    <SelectTrigger>
                      <span className={transferData.from ? '' : 'text-muted-foreground'}>
                        {transferData.from ? transferFromLabel || 'Локация' : 'Выберите'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Куда *</Label>
                  <Select
                    value={transferData.to}
                    onValueChange={(v) => setTransferData((prev) => ({ ...prev, to: v || '' }))}
                  >
                    <SelectTrigger>
                      <span className={transferData.to ? '' : 'text-muted-foreground'}>
                        {transferData.to ? transferToLabel || 'Локация' : 'Выберите'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {transferData.items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-7 space-y-2">
                    <Label className="text-xs">Товар</Label>
                    <Select value={item.product_id} onValueChange={(v) => updateTransferItem(index, 'product_id', v || '')}>
                      <SelectTrigger>
                        <span className={item.product_id ? '' : 'text-muted-foreground'}>
                          {item.product_id ? productNameById.get(item.product_id) || 'Товар' : 'Выберите товар'}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {allProducts.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} ({product.sku})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 space-y-2">
                    <Label className="text-xs">Количество</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={transferItemDrafts[index]?.quantity ?? String(item.quantity)}
                      onFocus={() => {
                        if ((transferItemDrafts[index]?.quantity ?? String(item.quantity)) === '0') {
                          updateTransferItemDraft(index, '')
                        }
                      }}
                      onChange={(e) => {
                        updateTransferItemDraft(index, e.target.value)
                        updateTransferItem(index, 'quantity', parseEditableNumber(e.target.value))
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    {transferData.items.length > 1 && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setTransferData((prev) => ({
                            ...prev,
                            items: prev.items.filter((_, itemIndex) => itemIndex !== index),
                          }))
                          setTransferItemDrafts((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                        }}
                      >
                        ×
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <Button type="button" variant="outline" size="sm" onClick={addTransferItem}>
                + Добавить товар
              </Button>

              <div className="space-y-2">
                <Label>Примечание</Label>
                <Textarea
                  value={transferData.notes}
                  onChange={(e) => setTransferData((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                />
              </div>

              {transferError && <div className="text-sm text-red-600 bg-red-50 p-3 rounded">{transferError}</div>}

              <div className="flex gap-4">
                <Button type="submit" disabled={transferLoading}>
                  {transferLoading ? 'Создание...' : 'Перевести'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowTransfer(false)}>
                  Отмена
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setShowTransfer(!showTransfer)}>
          <ArrowDownUp className="w-4 h-4 mr-1" /> Транзакция (Перевод)
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Поиск по названию или артикулу..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="w-64">
              <Select value={selectedLocation} onValueChange={(v) => setSelectedLocation(v || 'all')}>
                <SelectTrigger>
                  <span>
                    {selectedLocation === 'all'
                      ? 'Все локации'
                      : `${selectedLocationLabel} (${locations.find((l) => l.id === selectedLocation)?.type === 'warehouse' ? 'Склад' : 'Магазин'})`}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все локации</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name} ({location.type === 'warehouse' ? 'Склад' : 'Магазин'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <CardDescription>
            Показано: {filteredProducts.length} из {products.length} товаров
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                {searchQuery || selectedLocation !== 'all' ? 'Ничего не найдено' : 'Нет товаров в каталоге'}
              </p>
              {!searchQuery && selectedLocation === 'all' && (
                <Link href="/dashboard/products/new">
                  <Button>Добавить первый товар</Button>
                </Link>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Ед.</TableHead>
                  <TableHead>Цена закупки</TableHead>
                  <TableHead>Цена продажи</TableHead>
                  <TableHead>Мин. остаток</TableHead>
                  <TableHead>Общее кол-во</TableHead>
                  <TableHead>Локации</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => {
                  const allZero =
                    product.inventory.length > 0 &&
                    product.inventory.every((inventoryItem) => Number(inventoryItem.quantity) === 0)

                  return (
                    <TableRow key={product.id} className={allZero ? 'bg-red-50/50' : ''}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.unit}</TableCell>
                      <TableCell>
                        {Number(product.purchase_price).toFixed(2)} {product.currency}
                      </TableCell>
                      <TableCell>
                        {Number(product.sale_price).toFixed(2)} {product.currency}
                      </TableCell>
                      <TableCell>{product.min_stock_level}</TableCell>
                      <TableCell>
                        <span
                          className={`font-semibold ${
                            product.total_quantity === 0
                              ? 'text-red-600'
                              : product.total_quantity <= product.min_stock_level
                                ? 'text-[#F2994A]'
                                : 'text-[#27AE60]'
                          }`}
                        >
                          {product.total_quantity}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {product.inventory.map((inventoryItem) => {
                            const isZero = Number(inventoryItem.quantity) === 0
                            return (
                              <Badge
                                key={inventoryItem.id}
                                variant="outline"
                                className={`text-xs ${
                                  isZero
                                    ? 'border-red-300 bg-red-50 text-red-700'
                                    : Number(inventoryItem.quantity) <= product.min_stock_level
                                      ? 'border-[#F2994A] bg-orange-50 text-[#F2994A]'
                                      : 'border-[#27AE60] bg-green-50 text-[#27AE60]'
                                }`}
                              >
                                {inventoryItem.locations.name}: {inventoryItem.quantity}
                              </Badge>
                            )
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{product.sku}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Link href={`/dashboard/products/${product.id}/edit`}>
                            <Button variant="outline" size="icon" className="h-7 w-7">
                              <Pencil className="w-3 h-3" />
                            </Button>
                          </Link>
                          {deleteConfirm === product.id ? (
                            <div className="flex gap-1">
                              <Button
                                variant="destructive"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleDelete(product.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setDeleteConfirm(null)}
                              >
                                ✕
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setDeleteConfirm(product.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {filteredProducts.length > 0 && (
          <CardFooter className="flex justify-between border-t bg-muted/30 py-3">
            <span className="text-sm font-medium">Итого: {filteredProducts.length} товаров</span>
            <span className="text-sm font-medium">
              Общее количество: {grandTotalQuantity} | Общая стоимость: {grandTotalValue.toFixed(0)} {products[0]?.currency || 'UZS'}
            </span>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
