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
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Customer {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  source: string | null
  notes: string | null
  tags: string[]
  is_active: boolean
  created_at: string
}

interface CustomerKpi {
  customer_id: string
  purchases_count: number
  total_spent: number
  average_check: number
  first_purchase_at: string | null
  last_purchase_at: string | null
  current_debt: number
}

interface CustomerDebt {
  id: string
  status: 'open' | 'partially_paid' | 'closed' | 'cancelled'
  original_amount: number
  paid_amount: number
  outstanding_amount: number
  due_date: string | null
  created_at: string
}

interface Purchase {
  id: string
  total_amount: number
  currency: string
  created_at: string
  notes: string | null
}

interface CustomerDetails {
  customer: Customer
  kpis: CustomerKpi | null
  debts: CustomerDebt[]
  purchases: Purchase[]
}

interface NewCustomerForm {
  full_name: string
  phone: string
  email: string
  source: string
  tags: string
  notes: string
}

interface KpiRow {
  customer_id: string
  purchases_count: number
  total_spent: number
  average_check: number
  first_purchase_at: string | null
  last_purchase_at: string | null
  current_debt: number
}

export default function CustomersPage() {
  const { user, loading: authLoading, organizationId } = useAuth()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [kpiMap, setKpiMap] = useState<Map<string, CustomerKpi>>(new Map())
  const [query, setQuery] = useState('')
  const [onlyWithDebt, setOnlyWithDebt] = useState(false)

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const [newCustomer, setNewCustomer] = useState<NewCustomerForm>({
    full_name: '',
    phone: '',
    email: '',
    source: '',
    tags: '',
    notes: '',
  })

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [details, setDetails] = useState<CustomerDetails | null>(null)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const [customerResult, kpiResult] = await Promise.all([
        supabase
          .from('customers')
          .select('id, full_name, phone, email, source, notes, tags, is_active, created_at')
          .order('created_at', { ascending: false }),
        supabase.from('customer_kpis').select('*'),
      ])

      if (!customerResult.error && customerResult.data) {
        setCustomers(customerResult.data as Customer[])
      }

      if (!kpiResult.error && kpiResult.data) {
        const map = new Map<string, CustomerKpi>()
        for (const row of kpiResult.data as KpiRow[]) {
          map.set(row.customer_id, {
            customer_id: row.customer_id,
            purchases_count: Number(row.purchases_count || 0),
            total_spent: Number(row.total_spent || 0),
            average_check: Number(row.average_check || 0),
            first_purchase_at: row.first_purchase_at,
            last_purchase_at: row.last_purchase_at,
            current_debt: Number(row.current_debt || 0),
          })
        }
        setKpiMap(map)
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
      fetchCustomers()
    }
  }, [fetchCustomers, user])

  const filteredCustomers = customers.filter((customer) => {
    const kpi = kpiMap.get(customer.id)
    const hasDebt = (kpi?.current_debt || 0) > 0

    if (onlyWithDebt && !hasDebt) {
      return false
    }

    if (!query.trim()) {
      return true
    }

    const q = query.toLowerCase()
    return (
      customer.full_name.toLowerCase().includes(q) ||
      (customer.phone || '').toLowerCase().includes(q) ||
      (customer.email || '').toLowerCase().includes(q)
    )
  })

  const totalCustomers = filteredCustomers.length
  const withDebtCount = filteredCustomers.filter(
    (customer) => (kpiMap.get(customer.id)?.current_debt || 0) > 0
  ).length
  const totalDebtAmount = filteredCustomers.reduce(
    (sum, customer) => sum + Number(kpiMap.get(customer.id)?.current_debt || 0),
    0
  )

  const handleCreateCustomer = useCallback(async () => {
    setCreateError('')

    if (!newCustomer.full_name.trim()) {
      setCreateError('Укажите имя клиента')
      return
    }

    setCreateLoading(true)
    try {
      const auth = await supabase.auth.getUser()
      const currentUser = auth.data.user
      if (!currentUser) {
        throw new Error('Не авторизован')
      }

      const orgId = await resolveOrganizationId(supabase, organizationId)

      const tags = newCustomer.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

      const createResult = await supabase.from('customers').insert({
        organization_id: orgId,
        full_name: newCustomer.full_name.trim(),
        phone: newCustomer.phone.trim() || null,
        email: newCustomer.email.trim() || null,
        source: newCustomer.source.trim() || null,
        tags,
        notes: newCustomer.notes.trim() || null,
        is_active: true,
      })

      if (createResult.error) {
        throw new Error(createResult.error.message)
      }

      setNewCustomer({
        full_name: '',
        phone: '',
        email: '',
        source: '',
        tags: '',
        notes: '',
      })
      setShowCreateDialog(false)
      await fetchCustomers()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка создания клиента'
      setCreateError(message)
    } finally {
      setCreateLoading(false)
    }
  }, [fetchCustomers, newCustomer, organizationId, supabase])

  const openDetails = useCallback(
    async (customerId: string) => {
      setSelectedCustomerId(customerId)
      setDetailsLoading(true)
      setDetails(null)

      try {
        const [customerResult, kpiResult, debtsResult, purchasesResult] = await Promise.all([
          supabase
            .from('customers')
            .select('id, full_name, phone, email, source, notes, tags, is_active, created_at')
            .eq('id', customerId)
            .single(),
          supabase.from('customer_kpis').select('*').eq('customer_id', customerId).maybeSingle(),
          supabase
            .from('customer_debts')
            .select('id, status, original_amount, paid_amount, outstanding_amount, due_date, created_at')
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false }),
          supabase
            .from('transactions')
            .select('id, total_amount, currency, created_at, notes')
            .eq('type', 'sale')
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false })
            .limit(50),
        ])

        if (customerResult.error || !customerResult.data) {
          throw new Error('Клиент не найден')
        }

        setDetails({
          customer: customerResult.data as Customer,
          kpis: (kpiResult.data as CustomerKpi | null) || null,
          debts: (debtsResult.data as CustomerDebt[]) || [],
          purchases: (purchasesResult.data as Purchase[]) || [],
        })
      } catch (error) {
        console.error('Error loading customer details:', error)
      } finally {
        setDetailsLoading(false)
      }
    },
    [supabase]
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Клиенты</h1>
          <p className="mt-2 text-muted-foreground">Профили, показатели, история покупок и долги</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>Добавить клиента</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Клиентов</CardDescription>
            <CardTitle className="text-3xl">{totalCustomers}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Клиентов с долгом</CardDescription>
            <CardTitle className="text-3xl">{withDebtCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Суммарный долг</CardDescription>
            <CardTitle className="text-3xl">{totalDebtAmount.toFixed(0)} UZS</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по имени, телефону, email"
            />
            <div className="flex items-center gap-2">
              <input
                id="only-debt"
                type="checkbox"
                checked={onlyWithDebt}
                onChange={(event) => setOnlyWithDebt(event.target.checked)}
              />
              <Label htmlFor="only-debt">Только с долгами</Label>
            </div>
          </div>
          <CardDescription>
            Показано {filteredCustomers.length} из {customers.length}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredCustomers.length === 0 ? (
            <p className="text-muted-foreground">Клиенты не найдены</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>Контакт</TableHead>
                  <TableHead>Покупок</TableHead>
                  <TableHead>Потрачено</TableHead>
                  <TableHead>Средний чек</TableHead>
                  <TableHead>Долг</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => {
                  const kpi = kpiMap.get(customer.id)
                  const debt = Number(kpi?.current_debt || 0)
                  return (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.full_name}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{customer.phone || '-'}</div>
                          <div className="text-muted-foreground">{customer.email || '-'}</div>
                        </div>
                      </TableCell>
                      <TableCell>{kpi?.purchases_count || 0}</TableCell>
                      <TableCell>{Number(kpi?.total_spent || 0).toFixed(0)} UZS</TableCell>
                      <TableCell>{Number(kpi?.average_check || 0).toFixed(0)} UZS</TableCell>
                      <TableCell className={debt > 0 ? 'text-[#F2994A] font-semibold' : ''}>
                        {debt.toFixed(0)} UZS
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => openDetails(customer.id)}>
                          Профиль
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Новый клиент</DialogTitle>
            <DialogDescription>Минимум нужно только имя. Остальные поля можно заполнить позже.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="new-full-name">Имя *</Label>
              <Input
                id="new-full-name"
                value={newCustomer.full_name}
                onChange={(event) => setNewCustomer((prev) => ({ ...prev, full_name: event.target.value }))}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="new-phone">Телефон</Label>
                <Input
                  id="new-phone"
                  value={newCustomer.phone}
                  onChange={(event) => setNewCustomer((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-email">Email</Label>
                <Input
                  id="new-email"
                  value={newCustomer.email}
                  onChange={(event) => setNewCustomer((prev) => ({ ...prev, email: event.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="new-source">Источник</Label>
              <Input
                id="new-source"
                value={newCustomer.source}
                onChange={(event) => setNewCustomer((prev) => ({ ...prev, source: event.target.value }))}
                placeholder="Telegram, Instagram, офлайн"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="new-tags">Теги</Label>
              <Input
                id="new-tags"
                value={newCustomer.tags}
                onChange={(event) => setNewCustomer((prev) => ({ ...prev, tags: event.target.value }))}
                placeholder="VIP, опт, постоянный"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="new-notes">Заметки</Label>
              <Textarea
                id="new-notes"
                value={newCustomer.notes}
                onChange={(event) => setNewCustomer((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>

            {createError && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{createError}</div>}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Отмена
              </Button>
              <Button onClick={handleCreateCustomer} disabled={createLoading}>
                {createLoading ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedCustomerId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCustomerId(null)
            setDetails(null)
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          {detailsLoading || !details ? (
            <div className="py-10 text-center text-muted-foreground">Загрузка профиля...</div>
          ) : (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle>{details.customer.full_name}</DialogTitle>
                <DialogDescription>
                  {details.customer.phone || '-'} / {details.customer.email || '-'}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardDescription>Покупок</CardDescription>
                    <CardTitle className="text-2xl">{details.kpis?.purchases_count || 0}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardDescription>Сумма покупок</CardDescription>
                    <CardTitle className="text-2xl">{Number(details.kpis?.total_spent || 0).toFixed(0)} UZS</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardDescription>Текущий долг</CardDescription>
                    <CardTitle className="text-2xl text-[#F2994A]">{Number(details.kpis?.current_debt || 0).toFixed(0)} UZS</CardTitle>
                  </CardHeader>
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>История покупок</CardTitle>
                    <CardDescription>Последние 50 продаж</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {details.purchases.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Пока нет покупок</p>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-auto">
                        {details.purchases.map((purchase) => (
                          <div key={purchase.id} className="border rounded p-2 text-sm">
                            <div className="flex justify-between">
                              <span>{new Date(purchase.created_at).toLocaleString('ru-RU')}</span>
                              <span className="font-semibold">{Number(purchase.total_amount).toFixed(2)} {purchase.currency}</span>
                            </div>
                            {purchase.notes && <div className="text-muted-foreground mt-1">{purchase.notes}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Долги</CardTitle>
                    <CardDescription>Активные и закрытые обязательства</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {details.debts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Долгов нет</p>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-auto">
                        {details.debts.map((debt) => (
                          <div key={debt.id} className="border rounded p-2 text-sm">
                            <div className="flex justify-between">
                              <span>{new Date(debt.created_at).toLocaleDateString('ru-RU')}</span>
                              <span className="font-semibold">{Number(debt.outstanding_amount).toFixed(2)} UZS</span>
                            </div>
                            <div className="text-muted-foreground mt-1">
                              Статус: {debt.status} / Оплачено: {Number(debt.paid_amount).toFixed(2)} UZS
                            </div>
                            {debt.due_date && <div className="text-muted-foreground">Срок: {debt.due_date}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
