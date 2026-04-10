'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context'
import { createClient } from '@/lib/supabase/client'
import { resolveOrganizationId } from '@/lib/org/resolve-org-id'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface DebtRow {
  id: string
  customer_id: string
  original_amount: number
  paid_amount: number
  outstanding_amount: number
  status: 'open' | 'partially_paid' | 'closed' | 'cancelled'
  due_date: string | null
  created_at: string
  customers:
    | {
        full_name: string
        phone: string | null
      }
    | {
        full_name: string
        phone: string | null
      }[]
    | null
}

interface PaymentMethod {
  id: string
  name: string
  is_active: boolean
}

const DEBT_STATUS_LABEL: Record<'all' | 'open' | 'partially_paid' | 'closed' | 'cancelled', string> = {
  all: 'Все',
  open: 'Открыт',
  partially_paid: 'Частично оплачен',
  closed: 'Закрыт',
  cancelled: 'Отменен',
}

interface DebtPaymentForm {
  [debtId: string]: {
    amount: string
    payment_method_id: string
  }
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] || null
  return value
}

export default function DebtsPage() {
  const { user, loading: authLoading, organizationId } = useAuth()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [activeOrgId, setActiveOrgId] = useState('')
  const [loading, setLoading] = useState(true)
  const [debts, setDebts] = useState<DebtRow[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'open' | 'partially_paid' | 'closed' | 'cancelled'>('all')
  const [query, setQuery] = useState('')
  const [formState, setFormState] = useState<DebtPaymentForm>({})
  const [payingDebtId, setPayingDebtId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const paymentMethodNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const method of paymentMethods) {
      map.set(method.id, method.name)
    }
    return map
  }, [paymentMethods])

  const fetchData = useCallback(async (orgId: string) => {
    setLoading(true)
    try {
      const [debtsResult, methodsResult] = await Promise.all([
        supabase
          .from('customer_debts')
          .select('id, customer_id, original_amount, paid_amount, outstanding_amount, status, due_date, created_at, customers(full_name, phone)')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false }),
        supabase
          .from('payment_methods')
          .select('id, name, is_active')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
      ])

      if (!debtsResult.error && debtsResult.data) {
        const debtRows = debtsResult.data as unknown as DebtRow[]

        const methods = (!methodsResult.error && methodsResult.data
          ? (methodsResult.data as PaymentMethod[])
          : [])

        setDebts(debtRows)
        setPaymentMethods(methods)

        setFormState((prev) => {
          const next: DebtPaymentForm = { ...prev }
          for (const debt of debtRows) {
            if (!next[debt.id]) {
              next[debt.id] = {
                amount: '',
                payment_method_id: methods[0]?.id || '',
              }
            }
          }
          return next
        })
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
          await fetchData(orgId)
        } catch (error) {
          setLoading(false)
          setError(error instanceof Error ? error.message : 'Организация не найдена')
        }
      }

      run()
    }
  }, [fetchData, organizationId, supabase, user])

  const filteredDebts = debts.filter((debt) => {
    if (selectedStatus !== 'all' && debt.status !== selectedStatus) {
      return false
    }

    if (!query.trim()) {
      return true
    }

    const customer = firstRelation(debt.customers)
    const q = query.toLowerCase()
    return (
      (customer?.full_name || '').toLowerCase().includes(q) ||
      (customer?.phone || '').toLowerCase().includes(q)
    )
  })

  const totals = filteredDebts.reduce(
    (acc, debt) => {
      acc.original += Number(debt.original_amount || 0)
      acc.paid += Number(debt.paid_amount || 0)
      acc.outstanding += Number(debt.outstanding_amount || 0)
      return acc
    },
    {
      original: 0,
      paid: 0,
      outstanding: 0,
    }
  )

  const updateDebtForm = useCallback((debtId: string, field: 'amount' | 'payment_method_id', value: string) => {
    setFormState((prev) => ({
      ...prev,
      [debtId]: {
        amount: prev[debtId]?.amount || '',
        payment_method_id: prev[debtId]?.payment_method_id || '',
        [field]: value,
      },
    }))
  }, [])

  const submitDebtPayment = useCallback(
    async (debt: DebtRow) => {
      setError('')

      const values = formState[debt.id]
      const amount = Number(values?.amount || 0)
      const paymentMethodId = values?.payment_method_id || ''

      if (!amount || amount <= 0) {
        setError('Укажите сумму платежа')
        return
      }
      if (!paymentMethodId) {
        setError('Выберите тип оплаты')
        return
      }
      if (amount > Number(debt.outstanding_amount || 0)) {
        setError('Сумма платежа больше остатка долга')
        return
      }

      setPayingDebtId(debt.id)
      try {
        const auth = await supabase.auth.getUser()
        const currentUser = auth.data.user
        if (!currentUser) {
          throw new Error('Не авторизован')
        }

        const orgId = activeOrgId || (await resolveOrganizationId(supabase, organizationId))

        const rpcResult = await supabase.rpc('pay_customer_debt', {
          org_id: orgId,
          user_id_param: currentUser.id,
          debt_id_param: debt.id,
          payment_method_id_param: paymentMethodId,
          amount_param: amount,
          notes_param: 'Оплата долга из панели долгов',
        })

        if (rpcResult.error) {
          throw new Error(rpcResult.error.message)
        }

        const result = rpcResult.data as { success?: boolean; error?: string } | null
        if (!result?.success) {
          throw new Error(result?.error || 'Ошибка оплаты долга')
        }

        setFormState((prev) => ({
          ...prev,
          [debt.id]: {
            amount: '',
            payment_method_id: prev[debt.id]?.payment_method_id || '',
          },
        }))

        await fetchData(orgId)
      } catch (submitError) {
        const message = submitError instanceof Error ? submitError.message : 'Ошибка оплаты'
        setError(message)
      } finally {
        setPayingDebtId(null)
      }
    },
    [activeOrgId, fetchData, formState, organizationId, supabase]
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
        <h1 className="text-3xl font-bold">Долги клиентов</h1>
        <p className="mt-2 text-muted-foreground">Учет и погашение задолженностей</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Первичный долг</CardDescription>
            <CardTitle className="text-3xl">{totals.original.toFixed(0)} UZS</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Оплачено</CardDescription>
            <CardTitle className="text-3xl">{totals.paid.toFixed(0)} UZS</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Остаток</CardDescription>
            <CardTitle className="text-3xl text-[#F2994A]">{totals.outstanding.toFixed(0)} UZS</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по клиенту"
            />

            <Select
              value={selectedStatus}
              onValueChange={(value) => {
                setSelectedStatus((value || 'all') as 'all' | 'open' | 'partially_paid' | 'closed' | 'cancelled')
              }}
            >
              <SelectTrigger>
                <span>{DEBT_STATUS_LABEL[selectedStatus]}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="open">Открыт</SelectItem>
                <SelectItem value="partially_paid">Частично оплачен</SelectItem>
                <SelectItem value="closed">Закрыт</SelectItem>
                <SelectItem value="cancelled">Отменен</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <CardDescription>Найдено долгов: {filteredDebts.length}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded mb-3">{error}</div>}

          {filteredDebts.length === 0 ? (
            <p className="text-muted-foreground">Долгов не найдено</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Клиент</TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Изначально</TableHead>
                  <TableHead>Оплачено</TableHead>
                  <TableHead>Остаток</TableHead>
                  <TableHead>Оплата</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDebts.map((debt) => {
                  const customer = firstRelation(debt.customers)
                  const rowForm = formState[debt.id] || { amount: '', payment_method_id: '' }
                  const canPay = debt.status === 'open' || debt.status === 'partially_paid'

                  return (
                    <TableRow key={debt.id}>
                      <TableCell>
                        <div className="font-medium">{customer?.full_name || 'Клиент'}</div>
                        <div className="text-sm text-muted-foreground">{customer?.phone || '-'}</div>
                      </TableCell>
                      <TableCell>{new Date(debt.created_at).toLocaleDateString('ru-RU')}</TableCell>
                      <TableCell>{DEBT_STATUS_LABEL[debt.status]}</TableCell>
                      <TableCell>{Number(debt.original_amount).toFixed(2)} UZS</TableCell>
                      <TableCell>{Number(debt.paid_amount).toFixed(2)} UZS</TableCell>
                      <TableCell className={Number(debt.outstanding_amount) > 0 ? 'text-[#F2994A] font-semibold' : ''}>
                        {Number(debt.outstanding_amount).toFixed(2)} UZS
                      </TableCell>
                      <TableCell>
                        {canPay ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              className="w-28"
                              placeholder="Сумма"
                              type="number"
                              min="0"
                              step="0.01"
                              value={rowForm.amount}
                              onChange={(event) => updateDebtForm(debt.id, 'amount', event.target.value)}
                            />
                            <Select
                              value={rowForm.payment_method_id}
                              onValueChange={(value) =>
                                updateDebtForm(debt.id, 'payment_method_id', value || '')
                              }
                            >
                              <SelectTrigger className="w-44">
                                <span className={rowForm.payment_method_id ? '' : 'text-muted-foreground'}>
                                  {rowForm.payment_method_id
                                    ? paymentMethodNameById.get(rowForm.payment_method_id) || 'Тип оплаты'
                                    : 'Тип оплаты'}
                                </span>
                              </SelectTrigger>
                              <SelectContent>
                                {paymentMethods.map((method) => (
                                  <SelectItem key={method.id} value={method.id}>
                                    {method.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              onClick={() => submitDebtPayment(debt)}
                              disabled={payingDebtId === debt.id}
                            >
                              {payingDebtId === debt.id ? '...' : 'Оплатить'}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
