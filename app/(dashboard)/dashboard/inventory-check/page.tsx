'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Plus, FileText, CheckCircle, Clock, XCircle } from 'lucide-react'

interface InventorySession {
  id: string
  location_id: string
  user_id: string
  status: string
  notes: string | null
  started_at: string
  completed_at: string | null
  created_at: string
  locations: {
    name: string
    type: string
  } | null
  profiles: {
    full_name: string
  } | null
}

interface InventorySessionQueryRow {
  id: string
  location_id: string
  user_id: string
  status: string
  notes: string | null
  started_at: string
  completed_at: string | null
  created_at: string
}

export default function InventorySessionsPage() {
  const router = useRouter()
  const { user, loading: authLoading, organizationId } = useAuth()
  const [sessions, setSessions] = useState<InventorySession[]>([])
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
      loadSessions()
    } else if (!authLoading && user && !organizationId) {
      setLoading(false)
      setError('Организация пользователя не найдена. Обновите страницу или войдите снова.')
    }
  }, [authLoading, organizationId, user])

  async function loadSessions() {
    setLoading(true)
    setError('')

    if (!organizationId) {
      setSessions([])
      setLoading(false)
      return
    }

    const { data, error: queryError } = await supabase
      .from('inventory_sessions')
      .select('id, location_id, user_id, status, notes, started_at, completed_at, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (queryError) {
      console.error('Error loading inventory sessions:', queryError)
      setError(queryError.message || 'Ошибка загрузки инвентаризаций')
      setSessions([])
      setLoading(false)
      return
    }

    const rows = (data || []) as InventorySessionQueryRow[]

    const locationIds = Array.from(new Set(rows.map((row) => row.location_id).filter(Boolean)))
    const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)))

    const locationMap = new Map<string, { name: string; type: string }>()
    if (locationIds.length > 0) {
      const { data: locationRows, error: locationError } = await supabase
        .from('locations')
        .select('id, name, type')
        .in('id', locationIds)

      if (locationError) {
        console.error('Error loading inventory session locations:', locationError)
      } else {
        for (const location of locationRows || []) {
          locationMap.set(location.id, {
            name: location.name,
            type: location.type,
          })
        }
      }
    }

    const profileMap = new Map<string, { full_name: string }>()
    if (userIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds)

      if (profileError) {
        console.error('Error loading inventory session authors:', profileError)
      } else {
        for (const profile of profileRows || []) {
          profileMap.set(profile.id, {
            full_name: profile.full_name || 'Пользователь',
          })
        }
      }
    }

    const normalized: InventorySession[] = rows.map((row) => ({
      id: row.id,
      location_id: row.location_id,
      user_id: row.user_id,
      status: row.status,
      notes: row.notes,
      started_at: row.started_at,
      completed_at: row.completed_at,
      created_at: row.created_at,
      locations: locationMap.get(row.location_id) || null,
      profiles: profileMap.get(row.user_id) || null,
    }))

    setSessions(normalized)
    setLoading(false)
  }

  function getStatusBadge(status: string) {
    const statusConfig: Record<string, { label: string; variant: any; icon: any }> = {
      draft: { label: 'Черновик', variant: 'secondary', icon: FileText },
      in_progress: { label: 'В процессе', variant: 'default', icon: Clock },
      completed: { label: 'Завершена', variant: 'default', icon: CheckCircle },
      cancelled: { label: 'Отменена', variant: 'destructive', icon: XCircle }
    }

    const config = statusConfig[status] || statusConfig.draft
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    )
  }

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

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Инвентаризация</h1>
        <Link href="/dashboard/inventory-check/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Новая инвентаризация
          </Button>
        </Link>
      </div>

      {error && (
        <Card className="p-4 mb-4 border-red-200 bg-red-50">
          <div className="text-sm text-red-700">{error}</div>
        </Card>
      )}

      {sessions.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-semibold mb-2">Нет инвентаризаций</h3>
          <p className="text-gray-600 mb-4">
            Создайте первую инвентаризацию для проверки остатков
          </p>
          <Link href="/dashboard/inventory-check/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Создать инвентаризацию
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sessions.map((session) => (
            <Card
              key={session.id}
              className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => router.push(`/dashboard/inventory-check/${session.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold">
                      {session.locations?.name || 'Локация'}
                    </h3>
                    {getStatusBadge(session.status)}
                  </div>
                  
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>
                      Тип: {session.locations?.type === 'warehouse' ? 'Склад' : 'Магазин'}
                    </div>
                    <div>
                      Создал: {session.profiles?.full_name || 'Пользователь'}
                    </div>
                    <div>
                      Начата: {new Date(session.started_at).toLocaleString('ru-RU')}
                    </div>
                    {session.completed_at && (
                      <div>
                        Завершена: {new Date(session.completed_at).toLocaleString('ru-RU')}
                      </div>
                    )}
                    {session.notes && (
                      <div className="mt-2 text-gray-500 italic">
                        {session.notes}
                      </div>
                    )}
                  </div>
                </div>

                <Button variant="outline" size="sm">
                  Открыть
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
