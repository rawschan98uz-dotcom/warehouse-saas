'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Save, CheckCircle, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

interface InventoryItem {
  id: string
  product_id: string
  expected_quantity: number
  actual_quantity: number | null
  difference: number | null
  notes: string | null
  products: {
    sku: string
    name: string
    unit: string
  }
}

interface Session {
  id: string
  location_id: string
  status: string
  notes: string | null
  started_at: string
  completed_at: string | null
  locations: {
    name: string
    type: string
  } | null
}

interface SessionQueryRow {
  id: string
  location_id: string
  status: string
  notes: string | null
  started_at: string
  completed_at: string | null
}

interface InventoryItemQueryRow {
  id: string
  product_id: string
  expected_quantity: number
  actual_quantity: number | null
  difference: number | null
  notes: string | null
}

export default function InventorySessionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const sessionId = params.id as string
  const { user, loading: authLoading, organizationId } = useAuth()

  const [session, setSession] = useState<Session | null>(null)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [authLoading, router, user])

  useEffect(() => {
    if (sessionId && user && organizationId) {
      loadData()
    } else if (!authLoading && user && !organizationId) {
      setLoading(false)
      setError('Организация пользователя не найдена. Обновите страницу или войдите снова.')
    }
  }, [authLoading, organizationId, sessionId, user])

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      await Promise.all([loadSession(), loadItems()])
    } finally {
      setLoading(false)
    }
  }

  async function loadSession() {
    if (!organizationId) return

    const { data, error: queryError } = await supabase
      .from('inventory_sessions')
      .select('id, location_id, status, notes, started_at, completed_at')
      .eq('id', sessionId)
      .eq('organization_id', organizationId)
      .single()

    if (queryError) {
      console.error('Error loading inventory session:', queryError)
      setError(queryError.message || 'Ошибка загрузки инвентаризации')
      setSession(null)
      return
    }

    if (data) {
      const row = data as SessionQueryRow

      let location: { name: string; type: string } | null = null
      if (row.location_id) {
        const { data: locationRow, error: locationError } = await supabase
          .from('locations')
          .select('name, type')
          .eq('id', row.location_id)
          .maybeSingle()

        if (locationError) {
          console.error('Error loading session location:', locationError)
        } else if (locationRow) {
          location = {
            name: locationRow.name,
            type: locationRow.type,
          }
        }
      }

      setSession({
        id: row.id,
        location_id: row.location_id,
        status: row.status,
        notes: row.notes,
        started_at: row.started_at,
        completed_at: row.completed_at,
        locations: location,
      })
    }
  }

  async function loadItems() {
    const { data, error: queryError } = await supabase
      .from('inventory_items')
      .select('id, product_id, expected_quantity, actual_quantity, difference, notes')
      .eq('session_id', sessionId)
      .order('id', { ascending: true })

    if (queryError) {
      console.error('Error loading inventory items:', queryError)
      setError(queryError.message || 'Ошибка загрузки позиций инвентаризации')
      setItems([])
      return
    }

    if (data) {
      const rows = data as InventoryItemQueryRow[]

      const productIds = Array.from(new Set(rows.map((row) => row.product_id).filter(Boolean)))
      const productMap = new Map<string, { sku: string; name: string; unit: string }>()

      if (productIds.length > 0) {
        const { data: productRows, error: productError } = await supabase
          .from('products')
          .select('id, sku, name, unit')
          .in('id', productIds)
          .order('name')

        if (productError) {
          console.error('Error loading inventory products:', productError)
          setError(productError.message || 'Ошибка загрузки товаров инвентаризации')
        } else {
          for (const product of productRows || []) {
            productMap.set(product.id, {
              sku: product.sku,
              name: product.name,
              unit: product.unit,
            })
          }
        }
      }

      const normalized: InventoryItem[] = rows
        .map((row) => {
          const product = productMap.get(row.product_id)
          if (!product) return null

          return {
            id: row.id,
            product_id: row.product_id,
            expected_quantity: row.expected_quantity,
            actual_quantity: row.actual_quantity,
            difference: row.difference,
            notes: row.notes,
            products: product,
          }
        })
        .filter((row): row is InventoryItem => row !== null)

      normalized.sort((a, b) => a.products.name.localeCompare(b.products.name, 'ru'))

      setItems(normalized)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      for (const item of items) {
        if (item.actual_quantity !== null) {
          await supabase
            .from('inventory_items')
            .update({
              actual_quantity: item.actual_quantity,
              notes: item.notes
            })
            .eq('id', item.id)
        }
      }
      alert('Данные сохранены')
    } catch (error: any) {
      alert('Ошибка при сохранении: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleApply() {
    if (!confirm('Применить результаты инвентаризации? Это обновит остатки товаров.')) {
      return
    }

    setApplying(true)
    try {
      const pendingItems = items.filter((item) => item.actual_quantity !== null)
      if (pendingItems.length === 0) {
        throw new Error('Нет заполненных фактических значений для применения')
      }

      for (const item of pendingItems) {
        const { error: saveItemError } = await supabase
          .from('inventory_items')
          .update({
            actual_quantity: item.actual_quantity,
            notes: item.notes,
          })
          .eq('id', item.id)

        if (saveItemError) {
          throw saveItemError
        }
      }

      // Вызываем функцию применения инвентаризации
      const { data, error } = await supabase.rpc('apply_inventory_session', {
        session_id_param: sessionId
      })

      if (error) throw error

      const result = data as { success?: boolean; error?: string; updated_count?: number } | null
      if (!result?.success) {
        throw new Error(result?.error || 'Не удалось применить результаты инвентаризации')
      }

      alert(`Инвентаризация успешно применена. Обновлено позиций: ${result.updated_count ?? 0}`)
      router.push('/dashboard/inventory-check')

    } catch (error: any) {
      alert('Ошибка при применении: ' + error.message)
    } finally {
      setApplying(false)
    }
  }

  function updateItemQuantity(itemId: string, value: string) {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const actualQuantity = value === '' ? null : parseFloat(value)
        return { ...item, actual_quantity: actualQuantity }
      }
      return item
    }))
  }

  function updateItemNotes(itemId: string, value: string) {
    setItems(items.map(item => {
      if (item.id === itemId) {
        return { ...item, notes: value }
      }
      return item
    }))
  }

  function calculateDifference(item: InventoryItem): number | null {
    if (item.actual_quantity === null) return null
    return item.actual_quantity - item.expected_quantity
  }

  const completedCount = items.filter(i => i.actual_quantity !== null).length
  const totalCount = items.length
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  if (authLoading || loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">Загрузка...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (!session) {
    return (
      <div className="p-6">
        <Card className="p-4 border-red-200 bg-red-50">
          <div className="text-sm text-red-700">{error || 'Инвентаризация не найдена'}</div>
        </Card>
      </div>
    )
  }

  const canApply = session.status === 'in_progress' && completedCount === totalCount

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link href="/dashboard/inventory-check">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад к списку
          </Button>
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Инвентаризация: {session.locations?.name || 'Локация'}</h1>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>
            Тип: {session.locations?.type === 'warehouse' ? 'Склад' : 'Магазин'}
          </span>
          <span>•</span>
          <span>
            Начата: {new Date(session.started_at).toLocaleString('ru-RU')}
          </span>
        </div>
      </div>

      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold mb-1">Прогресс проверки</h3>
            <p className="text-sm text-gray-600">
              Проверено {completedCount} из {totalCount} товаров ({progress}%)
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving || session.status === 'completed'}
              variant="outline"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
            <Button
              onClick={handleApply}
              disabled={!canApply || applying}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {applying ? 'Применение...' : 'Применить результаты'}
            </Button>
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </Card>

      {session.status === 'completed' && (
        <Card className="p-4 mb-6 bg-green-50 border-green-200">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle className="w-5 h-5" />
            <span className="font-semibold">Инвентаризация завершена</span>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">SKU</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Товар</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Ед. изм.</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">Ожидается</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">Фактически</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">Разница</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Примечание</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => {
                const difference = calculateDifference(item)
                const hasDifference = difference !== null && difference !== 0

                return (
                  <tr key={item.id} className={hasDifference ? 'bg-yellow-50' : ''}>
                    <td className="px-4 py-3 text-sm">{item.products.sku}</td>
                    <td className="px-4 py-3 text-sm font-medium">{item.products.name}</td>
                    <td className="px-4 py-3 text-sm">{item.products.unit}</td>
                    <td className="px-4 py-3 text-sm text-right">{item.expected_quantity}</td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        step="0.01"
                        value={item.actual_quantity ?? ''}
                        onChange={(e) => updateItemQuantity(item.id, e.target.value)}
                        className="w-24 text-right"
                        disabled={session.status === 'completed'}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {difference !== null && (
                        <span className={difference > 0 ? 'text-green-600 font-semibold' : difference < 0 ? 'text-red-600 font-semibold' : ''}>
                          {difference > 0 ? '+' : ''}{difference}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="text"
                        value={item.notes ?? ''}
                        onChange={(e) => updateItemNotes(item.id, e.target.value)}
                        placeholder="Примечание"
                        className="w-full"
                        disabled={session.status === 'completed'}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {items.filter(i => {
        const diff = calculateDifference(i)
        return diff !== null && diff !== 0
      }).length > 0 && (
        <Card className="p-4 mt-6 bg-yellow-50 border-yellow-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-800 mb-1">Обнаружены расхождения</h3>
              <p className="text-sm text-yellow-700">
                Некоторые товары имеют расхождения между ожидаемым и фактическим количеством.
                Проверьте данные перед применением результатов.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
