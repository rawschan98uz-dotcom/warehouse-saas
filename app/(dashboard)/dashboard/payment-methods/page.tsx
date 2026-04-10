'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context'
import { createClient } from '@/lib/supabase/client'
import { resolveOrganizationId } from '@/lib/org/resolve-org-id'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

type PaymentType = 'cash' | 'card' | 'bank_transfer' | 'digital_wallet' | 'other'

const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  cash: 'Наличные',
  card: 'Карта',
  bank_transfer: 'Банковский перевод',
  digital_wallet: 'Электронный кошелек',
  other: 'Другое',
}

interface PaymentMethod {
  id: string
  code: string
  name: string
  type: PaymentType
  is_active: boolean
  sort_order: number
}

interface NewMethodForm {
  code: string
  name: string
  type: PaymentType
  sort_order: string
}

export default function PaymentMethodsPage() {
  const { user, loading: authLoading, organizationId } = useAuth()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [activeOrgId, setActiveOrgId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [newMethod, setNewMethod] = useState<NewMethodForm>({
    code: '',
    name: '',
    type: 'other',
    sort_order: '100',
  })

  const fetchMethods = useCallback(async (orgId: string) => {
    setLoading(true)
    try {
      const result = await supabase
        .from('payment_methods')
        .select('id, code, name, type, is_active, sort_order')
        .eq('organization_id', orgId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (!result.error && result.data) {
        const uniqueByCode = new Map<string, PaymentMethod>()
        for (const method of result.data as PaymentMethod[]) {
          if (!uniqueByCode.has(method.code)) {
            uniqueByCode.set(method.code, method)
          }
        }
        setMethods(Array.from(uniqueByCode.values()))
      } else {
        setMethods([])
      }
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [authLoading, router, user])

  useEffect(() => {
    if (user) {
      const run = async () => {
        try {
          const orgId = await resolveOrganizationId(supabase, organizationId)
          setActiveOrgId(orgId)
          await fetchMethods(orgId)
        } catch (error) {
          setLoading(false)
          setError(error instanceof Error ? error.message : 'Организация не найдена')
        }
      }

      run()
    }
  }, [fetchMethods, organizationId, supabase, user])

  const createMethod = useCallback(async () => {
    setError('')

    if (!newMethod.code.trim() || !newMethod.name.trim()) {
      setError('Укажите код и название')
      return
    }

    setSaving(true)
    try {
      const auth = await supabase.auth.getUser()
      const currentUser = auth.data.user
      if (!currentUser) {
        throw new Error('Не авторизован')
      }

      const orgId = activeOrgId || (await resolveOrganizationId(supabase, organizationId))

      const createResult = await supabase.from('payment_methods').insert({
        organization_id: orgId,
        code: newMethod.code.trim().toLowerCase(),
        name: newMethod.name.trim(),
        type: newMethod.type,
        sort_order: Number(newMethod.sort_order || 0),
        is_active: true,
      })

      if (createResult.error) {
        throw new Error(createResult.error.message)
      }

      setNewMethod({
        code: '',
        name: '',
        type: 'other',
        sort_order: '100',
      })
      await fetchMethods(orgId)
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : 'Ошибка создания типа оплаты'
      setError(message)
    } finally {
      setSaving(false)
    }
  }, [activeOrgId, fetchMethods, newMethod, organizationId, supabase])

  const toggleMethod = useCallback(
    async (method: PaymentMethod) => {
      const result = await supabase
        .from('payment_methods')
        .update({ is_active: !method.is_active })
        .eq('id', method.id)

      if (result.error) {
        setError(result.error.message)
        return
      }

      const orgId = activeOrgId || (await resolveOrganizationId(supabase, organizationId))
      await fetchMethods(orgId)
    },
    [activeOrgId, fetchMethods, organizationId, supabase]
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
      <div>
        <h1 className="text-3xl font-bold">Типы оплат</h1>
        <p className="mt-2 text-muted-foreground">Настраиваемые способы оплаты для смешанных платежей</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Новый тип оплаты</CardTitle>
          <CardDescription>Добавьте любой способ оплаты, нужный вашему бизнесу</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="method-code">Код</Label>
              <Input
                id="method-code"
                value={newMethod.code}
                onChange={(event) => setNewMethod((prev) => ({ ...prev, code: event.target.value }))}
                placeholder="kaspi_qr"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="method-name">Название</Label>
              <Input
                id="method-name"
                value={newMethod.name}
                onChange={(event) => setNewMethod((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Kaspi QR"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Тип</Label>
                <Select
                  value={newMethod.type}
                  onValueChange={(value) =>
                    setNewMethod((prev) => ({ ...prev, type: (value as PaymentType) || 'other' }))
                  }
                >
                  <SelectTrigger>
                    <span>{PAYMENT_TYPE_LABEL[newMethod.type]}</span>
                  </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Наличные</SelectItem>
                  <SelectItem value="card">Карта</SelectItem>
                  <SelectItem value="bank_transfer">Банковский перевод</SelectItem>
                  <SelectItem value="digital_wallet">Электронный кошелек</SelectItem>
                  <SelectItem value="other">Другое</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="method-order">Порядок</Label>
              <Input
                id="method-order"
                type="number"
                value={newMethod.sort_order}
                onChange={(event) => setNewMethod((prev) => ({ ...prev, sort_order: event.target.value }))}
              />
            </div>
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

          <div className="flex justify-end">
            <Button onClick={createMethod} disabled={saving}>
              {saving ? 'Сохранение...' : 'Добавить'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Список типов оплат</CardTitle>
          <CardDescription>Всего: {methods.length}</CardDescription>
        </CardHeader>
        <CardContent>
          {methods.length === 0 ? (
            <p className="text-muted-foreground">Нет типов оплат</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Код</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Порядок</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {methods.map((method) => (
                  <TableRow key={method.id}>
                    <TableCell className="font-mono">{method.code}</TableCell>
                    <TableCell className="font-medium">{method.name}</TableCell>
                    <TableCell>{PAYMENT_TYPE_LABEL[method.type]}</TableCell>
                    <TableCell>{method.sort_order}</TableCell>
                    <TableCell>{method.is_active ? 'Активен' : 'Отключен'}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => toggleMethod(method)}>
                        {method.is_active ? 'Отключить' : 'Включить'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
