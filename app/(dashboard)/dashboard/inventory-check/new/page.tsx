'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface Location {
  id: string
  name: string
  type: string
}

export default function NewInventorySessionPage() {
  const router = useRouter()
  const { user, loading: authLoading, organizationId } = useAuth()
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const supabase = createClient()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [authLoading, router, user])

  useEffect(() => {
    if (user && organizationId) {
      loadLocations()
    } else if (!authLoading && user && !organizationId) {
      setLoading(false)
      setError('Организация пользователя не найдена. Обновите страницу или войдите снова.')
    }
  }, [authLoading, organizationId, user])

  async function loadLocations() {
    setLoading(true)
    setError('')

    if (!organizationId) {
      setLocations([])
      setLoading(false)
      return
    }

    const { data, error: queryError } = await supabase
      .from('locations')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name')

    if (queryError) {
      console.error('Error loading locations for inventory:', queryError)
      setError(queryError.message || 'Ошибка загрузки локаций')
      setLocations([])
      setLoading(false)
      return
    }

    setLocations((data || []) as Location[])
    setLoading(false)
  }

  async function handleCreate() {
    if (!selectedLocation || !user || !organizationId) return

    setCreating(true)
    setError('')

    try {
      // Создаем сессию инвентаризации
      const { data: session, error: sessionError } = await supabase
        .from('inventory_sessions')
        .insert({
          organization_id: organizationId,
          location_id: selectedLocation,
          user_id: user.id,
          status: 'draft',
          notes: notes || null,
          started_at: new Date().toISOString()
        })
        .select()
        .single()

      if (sessionError) throw sessionError

      // Получаем все товары с остатками в выбранной локации
      const { data: inventory } = await supabase
        .from('inventory')
        .select('product_id, quantity')
        .eq('location_id', selectedLocation)

      // Создаем позиции инвентаризации
      if (inventory && inventory.length > 0) {
        const items = inventory.map(item => ({
          session_id: session.id,
          product_id: item.product_id,
          expected_quantity: item.quantity,
          actual_quantity: null
        }))

        await supabase
          .from('inventory_items')
          .insert(items)
      }

      // Обновляем статус на "в процессе"
      await supabase
        .from('inventory_sessions')
        .update({ status: 'in_progress' })
        .eq('id', session.id)

      router.push(`/dashboard/inventory-check/${session.id}`)

    } catch (error: any) {
      const message = error?.message || 'Ошибка при создании инвентаризации'
      setError(message)
    } finally {
      setCreating(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="text-center py-12">Загрузка...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/dashboard/inventory-check">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">Новая инвентаризация</h1>

      <Card className="p-6">
        <div className="space-y-4">
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded">
              {error}
            </div>
          )}

          <div>
            <Label htmlFor="location">Локация *</Label>
            <select
              id="location"
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={creating}
            >
              <option value="">Выберите локацию</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} ({location.type === 'warehouse' ? 'Склад' : 'Магазин'})
                </option>
              ))}
            </select>
            {locations.length === 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                Локации не найдены. Сначала создайте локацию в разделе "Локации".
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="notes">Примечания</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Дополнительная информация об инвентаризации"
              rows={4}
              disabled={creating}
            />
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Как проводить инвентаризацию:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
              <li>Выберите локацию для проверки</li>
              <li>Система загрузит все товары с текущими остатками</li>
              <li>Введите фактическое количество для каждого товара</li>
              <li>Система автоматически рассчитает расхождения</li>
              <li>Примените результаты для обновления остатков</li>
            </ol>
          </div>

          <Button
            onClick={handleCreate}
            disabled={!selectedLocation || creating || locations.length === 0}
            className="w-full"
          >
            {creating ? 'Создание...' : 'Создать инвентаризацию'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
