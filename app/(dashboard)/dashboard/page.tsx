'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/auth-context'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface DashboardStats {
  totalProducts: number
  totalInventoryValue: number
  totalLocations: number
  totalTransactions: number
  lowStockCount: number
  todaySales: number
  todayRevenue: number
  openDebtsCount: number
  openDebtsAmount: number
  currency: 'UZS' | 'USD'
}

interface InventoryWithProduct {
  quantity: number
  products:
    | {
        purchase_price: number
        min_stock_level: number
        currency: 'UZS' | 'USD'
      }
    | {
        purchase_price: number
        min_stock_level: number
        currency: 'UZS' | 'USD'
      }[]
    | null
}

interface TodaySaleRow {
  total_amount: number
}

interface OpenDebtRow {
  outstanding_amount: number
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] || null
  return value
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalInventoryValue: 0,
    totalLocations: 0,
    totalTransactions: 0,
    lowStockCount: 0,
    todaySales: 0,
    todayRevenue: 0,
    openDebtsCount: 0,
    openDebtsAmount: 0,
    currency: 'UZS',
  })
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    try {
      const [productsCountResult, locationsCountResult, transactionsCountResult] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('locations').select('*', { count: 'exact', head: true }),
        supabase.from('transactions').select('*', { count: 'exact', head: true }),
      ])

      const inventoryResult = await supabase
        .from('inventory')
        .select('quantity, products(purchase_price, min_stock_level, currency)')

      let totalInventoryValue = 0
      let currency: 'UZS' | 'USD' = 'UZS'
      let lowStockCount = 0

      const inventoryRows = (inventoryResult.data || []) as InventoryWithProduct[]
      for (const row of inventoryRows) {
        const product = firstRelation(row.products)
        if (!product) continue

        totalInventoryValue += Number(row.quantity || 0) * Number(product.purchase_price || 0)
        currency = product.currency || currency

        const minStock = Number(product.min_stock_level || 0)
        if (minStock > 0 && Number(row.quantity || 0) <= minStock) {
          lowStockCount += 1
        }
      }

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const todaySalesResult = await supabase
        .from('transactions')
        .select('total_amount')
        .eq('type', 'sale')
        .gte('created_at', today.toISOString())

      const todaySalesRows = (todaySalesResult.data || []) as TodaySaleRow[]
      const todaySales = todaySalesRows.length
      const todayRevenue = todaySalesRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)

      const openDebtsResult = await supabase
        .from('customer_debts')
        .select('outstanding_amount')
        .in('status', ['open', 'partially_paid'])

      const openDebtRows = (openDebtsResult.data || []) as OpenDebtRow[]
      const openDebtsCount = openDebtRows.length
      const openDebtsAmount = openDebtRows.reduce(
        (sum, row) => sum + Number(row.outstanding_amount || 0),
        0
      )

      setStats({
        totalProducts: productsCountResult.count || 0,
        totalInventoryValue,
        totalLocations: locationsCountResult.count || 0,
        totalTransactions: transactionsCountResult.count || 0,
        lowStockCount,
        todaySales,
        todayRevenue,
        openDebtsCount,
        openDebtsAmount,
        currency,
      })
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
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
      fetchStats()
    }
  }, [fetchStats, user])

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Загрузка...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Дашборд</h1>
        <p className="mt-2 text-muted-foreground">Сводка по складу, продажам и клиентам</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/products">
          <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
            <CardHeader>
              <CardDescription>Всего товаров</CardDescription>
              <CardTitle className="text-3xl">{stats.totalProducts}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">В каталоге</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/products">
          <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
            <CardHeader>
              <CardDescription>Остаток (себестоимость)</CardDescription>
              <CardTitle className="text-3xl">
                {stats.totalInventoryValue.toFixed(0)} {stats.currency}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Текущая стоимость запасов</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/locations">
          <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
            <CardHeader>
              <CardDescription>Локации</CardDescription>
              <CardTitle className="text-3xl">{stats.totalLocations}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Склады и магазины</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/transactions">
          <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
            <CardHeader>
              <CardDescription>Транзакции</CardDescription>
              <CardTitle className="text-3xl">{stats.totalTransactions}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Все операции</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Продажи сегодня</CardDescription>
            <CardTitle className="text-3xl">{stats.todaySales}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Кол-во чеков</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Выручка сегодня</CardDescription>
            <CardTitle className="text-3xl">
              {stats.todayRevenue.toFixed(0)} {stats.currency}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Сумма продаж</p>
          </CardContent>
        </Card>

        <Link href="/dashboard/debts">
          <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
            <CardHeader>
              <CardDescription>Открытые долги</CardDescription>
              <CardTitle className="text-3xl">{stats.openDebtsCount}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                На сумму {stats.openDebtsAmount.toFixed(0)} {stats.currency}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Card className={stats.lowStockCount > 0 ? 'border-[#F2994A]' : ''}>
          <CardHeader>
            <CardDescription>Низкий остаток</CardDescription>
            <CardTitle
              className="text-3xl"
              style={{ color: stats.lowStockCount > 0 ? '#F2994A' : undefined }}
            >
              {stats.lowStockCount}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Товаров ниже минимума</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
