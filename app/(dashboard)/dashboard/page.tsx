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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

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
      setLastUpdated(new Date())
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
      <div className="bg-gradient-to-r from-[#0055FF] to-[#011931] rounded-2xl p-6 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Дашборд управления складом</h1>
            <p className="mt-2 opacity-90">Сводка по складу, продажам и клиентам</p>
          </div>
          <div className="mt-4 md:mt-0">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 text-center">
              <p className="text-sm opacity-80">Последнее обновление</p>
              <p className="font-medium">
                {lastUpdated ? lastUpdated.toLocaleTimeString('ru-RU') : '...'}
              </p>
            </div>
          </div>
        </div>
        
        <div className="mt-4 flex justify-end">
          <button 
            onClick={fetchStats}
            disabled={loading}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg 
              className={`w-4 h-4 transition-transform ${loading ? 'animate-spin' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Обновить данные
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/products">
          <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 h-full border-0 shadow-sm hover:scale-[1.02] bg-gradient-to-br from-white to-[#f7f9fc] dark:from-[#011931] dark:to-[#05213d]">
            <CardHeader className="pb-2">
              <CardDescription className="text-[#011931] dark:text-[#A7A9AC]">Всего товаров</CardDescription>
              <CardTitle className="text-3xl text-[#011931] dark:text-white">
                {stats.totalProducts}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[#A7A9AC] dark:text-[#D1D3D4]">В каталоге</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/products">
          <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 h-full border-0 shadow-sm hover:scale-[1.02] bg-gradient-to-br from-white to-[#f7f9fc] dark:from-[#011931] dark:to-[#05213d]">
            <CardHeader className="pb-2">
              <CardDescription className="text-[#011931] dark:text-[#A7A9AC]">Остаток (себестоимость)</CardDescription>
              <CardTitle className="text-3xl text-[#011931] dark:text-white">
                {stats.totalInventoryValue.toFixed(0)} {stats.currency}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[#A7A9AC] dark:text-[#D1D3D4]">Текущая стоимость запасов</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/locations">
          <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 h-full border-0 shadow-sm hover:scale-[1.02] bg-gradient-to-br from-white to-[#f7f9fc] dark:from-[#011931] dark:to-[#05213d]">
            <CardHeader className="pb-2">
              <CardDescription className="text-[#011931] dark:text-[#A7A9AC]">Локации</CardDescription>
              <CardTitle className="text-3xl text-[#011931] dark:text-white">
                {stats.totalLocations}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[#A7A9AC] dark:text-[#D1D3D4]">Склады и магазины</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/transactions">
          <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 h-full border-0 shadow-sm hover:scale-[1.02] bg-gradient-to-br from-white to-[#f7f9fc] dark:from-[#011931] dark:to-[#05213d]">
            <CardHeader className="pb-2">
              <CardDescription className="text-[#011931] dark:text-[#A7A9AC]">Транзакции</CardDescription>
              <CardTitle className="text-3xl text-[#011931] dark:text-white">
                {stats.totalTransactions}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[#A7A9AC] dark:text-[#D1D3D4]">Все операции</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-white to-[#f7f9fc] dark:from-[#011931] dark:to-[#05213d]">
          <CardHeader className="pb-2">
            <CardDescription className="text-[#011931] dark:text-[#A7A9AC]">Продажи сегодня</CardDescription>
            <CardTitle className="text-3xl text-[#011931] dark:text-white">
              {stats.todaySales}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[#A7A9AC] dark:text-[#D1D3D4]">Кол-во чеков</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-white to-[#f7f9fc] dark:from-[#011931] dark:to-[#05213d]">
          <CardHeader className="pb-2">
            <CardDescription className="text-[#011931] dark:text-[#A7A9AC]">Выручка сегодня</CardDescription>
            <CardTitle className="text-3xl text-[#011931] dark:text-white">
              {stats.todayRevenue.toFixed(0)} {stats.currency}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[#A7A9AC] dark:text-[#D1D3D4]">Сумма продаж</p>
          </CardContent>
        </Card>

        <Link href="/dashboard/debts">
          <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 h-full border-0 shadow-sm hover:scale-[1.02] bg-gradient-to-br from-white to-[#f7f9fc] dark:from-[#011931] dark:to-[#05213d]">
            <CardHeader className="pb-2">
              <CardDescription className="text-[#011931] dark:text-[#A7A9AC]">Открытые долги</CardDescription>
              <CardTitle className="text-3xl text-[#011931] dark:text-white">
                {stats.openDebtsCount}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[#A7A9AC] dark:text-[#D1D3D4]">
                На сумму {stats.openDebtsAmount.toFixed(0)} {stats.currency}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Card className={`border-0 shadow-sm bg-gradient-to-br from-white to-[#f7f9fc] dark:from-[#011931] dark:to-[#05213d] ${stats.lowStockCount > 0 ? 'ring-2 ring-[#F2994A]/50' : ''}`}>
          <CardHeader className="pb-2">
            <CardDescription className="text-[#011931] dark:text-[#A7A9AC]">Низкий остаток</CardDescription>
            <CardTitle
              className="text-3xl"
              style={{ color: stats.lowStockCount > 0 ? '#F2994A' : '#011931' }}
            >
              {stats.lowStockCount}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[#A7A9AC] dark:text-[#D1D3D4]">Товаров ниже минимума</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
