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
import { Badge } from '@/components/ui/badge'
import { getTransactionTypeLabel, getTransactionTypeBadgeColor } from '@/lib/utils/transaction-utils'
import Link from 'next/link'
import { Search, ArrowDownUp } from 'lucide-react'

interface Transaction {
  id: string
  type: 'arrival' | 'sale' | 'transfer' | 'expense'
  total_amount: number
  currency: string
  notes: string | null
  created_at: string
  from_location_id: string | null
  to_location_id: string | null
  locations_from?: { name: string } | null
  locations_to?: { name: string } | null
  transaction_items?: Array<{
    quantity: number
    price: number
    currency: string
    products: { name: string; sku: string }
  }>
}

interface ProductOption {
  id: string
  name: string
  sku: string
}

const FILTER_TYPE_LABEL: Record<'all' | 'arrival' | 'sale' | 'transfer' | 'expense', string> = {
  all: 'Все типы',
  arrival: 'Приход',
  sale: 'Продажа',
  transfer: 'Перевод',
  expense: 'Расход',
}

export default function TransactionsPage() {
  const { user, loading: authLoading, organizationId } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [activeOrgId, setActiveOrgId] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterLocation, setFilterLocation] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [locations, setLocations] = useState<Array<{ id: string; name: string; type: string }>>([])
  const [expandedTx, setExpandedTx] = useState<string | null>(null)
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferError, setTransferError] = useState('')
  const [transferData, setTransferData] = useState({ from: '', to: '', items: [{ product_id: '', quantity: 0 }], notes: '' })
  const [products, setProducts] = useState<ProductOption[]>([])

  const selectedFilterLocationName =
    locations.find((location) => location.id === filterLocation)?.name || ''

  const selectedFromLocationName =
    locations.find((location) => location.id === transferData.from)?.name || ''

  const selectedToLocationName =
    locations.find((location) => location.id === transferData.to)?.name || ''

  const productNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const product of products) {
      map.set(product.id, `${product.name} (${product.sku})`)
    }
    return map
  }, [products])

  useEffect(() => {
    if (!authLoading && !user) router.push('/login')
  }, [user, authLoading, router])

  useEffect(() => {
    if (user) {
      const run = async () => {
        try {
          const orgId = await resolveOrganizationId(supabase, organizationId)
          setActiveOrgId(orgId)
          await Promise.all([
            fetchTransactions(orgId),
            fetchLocations(orgId),
            fetchTransferProducts(orgId),
          ])
        } catch (error) {
          setLoading(false)
          setTransferError(error instanceof Error ? error.message : 'Организация не найдена')
        }
      }

      run()
    }
  }, [organizationId, user])

  useEffect(() => {
    applyFilters()
  }, [searchQuery, filterLocation, filterType, allTransactions])

  const fetchTransactions = async (orgId: string) => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select(`*, locations_from:from_location_id(name), locations_to:to_location_id(name), transaction_items(quantity, price, currency, products(name, sku))`)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setAllTransactions(data || [])
      setTransactions(data || [])
    } catch (error) {
      console.error('Error fetching transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchLocations = async (orgId: string) => {
    const { data } = await supabase
      .from('locations')
      .select('id, name, type')
      .eq('organization_id', orgId)
      .order('name')
    if (data) setLocations(data)
  }

  const applyFilters = () => {
    let filtered = [...allTransactions]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((tx) => {
        const matchesProduct = tx.transaction_items?.some(
          (item) =>
            item.products.name.toLowerCase().includes(query) ||
            item.products.sku.toLowerCase().includes(query)
        )
        const matchesNotes = tx.notes?.toLowerCase().includes(query)
        return Boolean(matchesProduct || matchesNotes)
      })
    }

    if (filterLocation !== 'all') {
      filtered = filtered.filter(tx =>
        tx.from_location_id === filterLocation || tx.to_location_id === filterLocation
      )
    }

    if (filterType !== 'all') {
      filtered = filtered.filter(tx => tx.type === filterType)
    }

    setTransactions(filtered)
  }

  const toggleTx = (id: string) => setExpandedTx(expandedTx === id ? null : id)

  const addTransferItem = () => {
    setTransferData({ ...transferData, items: [...transferData.items, { product_id: '', quantity: 0 }] })
  }

  const updateTransferItem = (index: number, field: string, value: any) => {
    const newItems = [...transferData.items]
    newItems[index] = { ...newItems[index], [field]: value }
    setTransferData({ ...transferData, items: newItems })
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
        if (product) totalAmount += item.quantity * product.purchase_price
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
          price: product?.purchase_price || 0,
          currency: product?.currency || 'UZS',
          total: item.quantity * (product?.purchase_price || 0),
        })

        const fromInv = await supabase.from('inventory').select('*').eq('product_id', item.product_id).eq('location_id', transferData.from).single()
        if (fromInv.data) {
          await supabase.from('inventory').update({ quantity: fromInv.data.quantity - item.quantity }).eq('id', fromInv.data.id)
        }

        const toInv = await supabase.from('inventory').select('*').eq('product_id', item.product_id).eq('location_id', transferData.to).single()
        if (toInv.data) {
          await supabase.from('inventory').update({ quantity: toInv.data.quantity + item.quantity }).eq('id', toInv.data.id)
        } else {
          await supabase.from('inventory').insert({
            organization_id: orgId,
            product_id: item.product_id,
            location_id: transferData.to,
            quantity: item.quantity,
          })
        }
      }

      setShowTransferForm(false)
      setTransferData({ from: '', to: '', items: [{ product_id: '', quantity: 0 }], notes: '' })
      await Promise.all([fetchTransactions(orgId), fetchTransferProducts(orgId)])
    } catch (err: any) {
      setTransferError(err.message || 'Ошибка')
    } finally {
      setTransferLoading(false)
    }
  }

  const fetchTransferProducts = async (orgId: string) => {
    const { data } = await supabase
      .from('products')
      .select('id, name, sku')
      .eq('organization_id', orgId)
      .order('name')

    if (data) {
      setProducts(data as ProductOption[])
    } else {
      setProducts([])
    }
  }

  if (authLoading || loading) return <div className="flex items-center justify-center min-h-screen"><div className="text-lg">Загрузка...</div></div>
  if (!user) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Транзакции</h1>
          <p className="mt-2 text-muted-foreground">История операций со складом</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex">
          <Button variant="outline" onClick={() => setShowTransferForm(!showTransferForm)}>
            <ArrowDownUp className="w-4 h-4 mr-1" /> Перевод
          </Button>
          <Link href="/dashboard/transactions/new">
            <Button>Новая транзакция</Button>
          </Link>
        </div>
      </div>

      {showTransferForm && (
        <Card>
          <CardHeader>
            <CardTitle>Перевод между локациями</CardTitle>
            <CardDescription>Перемещение товаров с одной локации на другую</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Откуда *</Label>
                  <Select value={transferData.from} onValueChange={(v) => setTransferData({ ...transferData, from: v || '' })}>
                    <SelectTrigger>
                      <span className={transferData.from ? '' : 'text-muted-foreground'}>
                        {transferData.from ? selectedFromLocationName || 'Локация' : 'Выберите'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Куда *</Label>
                  <Select value={transferData.to} onValueChange={(v) => setTransferData({ ...transferData, to: v || '' })}>
                    <SelectTrigger>
                      <span className={transferData.to ? '' : 'text-muted-foreground'}>
                        {transferData.to ? selectedToLocationName || 'Локация' : 'Выберите'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {transferData.items.map((item, index) => (
                <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
                  <div className="col-span-1 sm:col-span-7 space-y-2">
                    <Label className="text-xs">Товар</Label>
                    <Select value={item.product_id} onValueChange={(v) => updateTransferItem(index, 'product_id', v || '')}>
                      <SelectTrigger>
                        <span className={item.product_id ? '' : 'text-muted-foreground'}>
                          {item.product_id ? productNameById.get(item.product_id) || 'Товар' : 'Выберите товар'}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 sm:col-span-3 space-y-2">
                    <Label className="text-xs">Количество</Label>
                    <Input type="number" step="0.01" min="0" value={item.quantity} onChange={(e) => updateTransferItem(index, 'quantity', parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    {transferData.items.length > 1 && <Button type="button" variant="destructive" size="sm" onClick={() => setTransferData({ ...transferData, items: transferData.items.filter((_, i) => i !== index) })}>×</Button>}
                  </div>
                </div>
              ))}

              <Button type="button" variant="outline" size="sm" onClick={addTransferItem}>+ Добавить товар</Button>

              <div className="space-y-2">
                <Label>Примечание</Label>
                <Textarea value={transferData.notes} onChange={(e) => setTransferData({ ...transferData, notes: e.target.value })} rows={2} />
              </div>

              {transferError && <div className="text-sm text-red-600 bg-red-50 p-3 rounded">{transferError}</div>}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="submit" disabled={transferLoading}>{transferLoading ? 'Создание...' : 'Перевести'}</Button>
                <Button type="button" variant="outline" onClick={() => setShowTransferForm(false)}>Отмена</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Поиск по товару..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
            <div className="w-full lg:col-span-3 lg:w-auto">
              <Select value={filterLocation} onValueChange={(v) => setFilterLocation(v || 'all')}>
                <SelectTrigger>
                  <span>{filterLocation === 'all' ? 'Все локации' : selectedFilterLocationName || 'Локация'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все локации</SelectItem>
                  {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full lg:col-span-3 lg:w-auto">
              <Select value={filterType} onValueChange={(v) => setFilterType(v || 'all')}>
                <SelectTrigger>
                  <span>{FILTER_TYPE_LABEL[(filterType as 'all' | 'arrival' | 'sale' | 'transfer' | 'expense') || 'all']}</span>
                </SelectTrigger>
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
          <CardDescription>Показано: {transactions.length} из {allTransactions.length} транзакций</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">Нет транзакций</p>
              <Link href="/dashboard/transactions/new"><Button>Создать первую транзакцию</Button></Link>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div key={tx.id} className="border rounded-lg overflow-hidden">
                  <div onClick={() => toggleTx(tx.id)} className="flex flex-col gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <Badge className={getTransactionTypeBadgeColor(tx.type)}>{getTransactionTypeLabel(tx.type)}</Badge>
                      <p className="text-sm text-muted-foreground">
                        {new Date(tx.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold">{tx.total_amount.toFixed(2)} {tx.currency}</p>
                        <p className="text-sm text-muted-foreground">
                          {tx.type === 'transfer' ? `${tx.locations_from?.name || '—'} → ${tx.locations_to?.name || '—'}` : tx.locations_to?.name || tx.locations_from?.name || '—'}
                        </p>
                      </div>
                      <span className="text-muted-foreground">{expandedTx === tx.id ? '▼' : '▶'}</span>
                    </div>
                  </div>
                  {expandedTx === tx.id && (
                    <div className="bg-muted/30 p-4 border-t space-y-3">
                      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                        <div><p className="text-muted-foreground">Тип:</p><p className="font-medium">{getTransactionTypeLabel(tx.type)}</p></div>
                        <div><p className="text-muted-foreground">Дата:</p><p className="font-medium">{new Date(tx.created_at).toLocaleString('ru-RU')}</p></div>
                        {tx.locations_from && <div><p className="text-muted-foreground">Откуда:</p><p className="font-medium">{tx.locations_from.name}</p></div>}
                        {tx.locations_to && <div><p className="text-muted-foreground">Куда:</p><p className="font-medium">{tx.locations_to.name}</p></div>}
                        <div><p className="text-muted-foreground">Сумма:</p><p className="font-medium text-lg">{tx.total_amount.toFixed(2)} {tx.currency}</p></div>
                        {tx.notes && <div className="col-span-2"><p className="text-muted-foreground">Примечание:</p><p className="font-medium">{tx.notes}</p></div>}
                      </div>
                      {(tx.transaction_items?.length ?? 0) > 0 && (
                        <div className="mt-4">
                          <p className="text-sm font-medium mb-2">Товары:</p>
                          <div className="space-y-2">
                            {(tx.transaction_items || []).map((item, index) => (
                              <div key={index} className="flex flex-col gap-2 rounded border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                                <div><p className="font-medium">{item.products.name}</p><p className="text-sm text-muted-foreground">Артикул: {item.products.sku}</p></div>
                                <div className="text-left sm:text-right">
                                  <p className="font-medium">{item.quantity} шт × {item.price} {item.currency}</p>
                                  <p className="text-sm text-muted-foreground">Итого: {(item.quantity * item.price).toFixed(2)} {item.currency}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
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
