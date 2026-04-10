'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/auth-context'
import { createClient } from '@/lib/supabase/client'
import {
  Users,
  ShoppingCart,
  DollarSign,
  Clock,
  Package,
  MapPin,
  ArrowLeftRight,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'

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

// Demo chart data
const salesChartData = [
  { name: '5k', value: 30 },
  { name: '10k', value: 35 },
  { name: '15k', value: 45 },
  { name: '20k', value: 80 },
  { name: '25k', value: 55 },
  { name: '30k', value: 60 },
  { name: '35k', value: 48 },
  { name: '40k', value: 52 },
  { name: '45k', value: 65 },
  { name: '50k', value: 55 },
  { name: '55k', value: 50 },
  { name: '60k', value: 58 },
]

const revenueChartData = [
  { name: '5k', sales: 30, profit: 20 },
  { name: '10k', sales: 40, profit: 28 },
  { name: '15k', sales: 45, profit: 32 },
  { name: '20k', sales: 55, profit: 40 },
  { name: '25k', sales: 65, profit: 48 },
  { name: '30k', sales: 60, profit: 55 },
  { name: '35k', sales: 70, profit: 50 },
  { name: '40k', sales: 55, profit: 42 },
  { name: '45k', sales: 60, profit: 48 },
  { name: '50k', sales: 65, profit: 52 },
  { name: '55k', sales: 72, profit: 58 },
  { name: '60k', sales: 68, profit: 55 },
]

const recentDeals = [
  {
    product: 'Товар #1',
    location: 'Основной склад',
    date: '12.04.2026 - 14:30',
    quantity: 423,
    amount: '$34,295',
    status: 'delivered' as const,
  },
  {
    product: 'Товар #2',
    location: 'Магазин #2',
    date: '12.04.2026 - 12:15',
    quantity: 150,
    amount: '$12,500',
    status: 'pending' as const,
  },
  {
    product: 'Товар #3',
    location: 'Склад резервный',
    date: '11.04.2026 - 18:00',
    quantity: 89,
    amount: '$8,420',
    status: 'delivered' as const,
  },
  {
    product: 'Товар #4',
    location: 'Магазин #1',
    date: '11.04.2026 - 09:45',
    quantity: 35,
    amount: '$2,100',
    status: 'rejected' as const,
  },
  {
    product: 'Товар #5',
    location: 'Основной склад',
    date: '10.04.2026 - 16:20',
    quantity: 210,
    amount: '$18,750',
    status: 'delivered' as const,
  },
]

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
      <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 130px)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-[#4C6FFF] border-t-transparent rounded-full animate-spin" />
          <div className="text-[var(--muted-foreground)] text-sm">Загрузка...</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const statCards = [
    {
      title: 'Всего товаров',
      value: stats.totalProducts.toLocaleString(),
      trend: '+8.5%',
      trendDir: 'up' as const,
      trendText: 'По сравнению со вчера',
      icon: Package,
      iconColor: 'purple',
      href: '/dashboard/products',
    },
    {
      title: 'Транзакции',
      value: stats.totalTransactions.toLocaleString(),
      trend: '+1.3%',
      trendDir: 'up' as const,
      trendText: 'За прошлую неделю',
      icon: ArrowLeftRight,
      iconColor: 'yellow',
      href: '/dashboard/transactions',
    },
    {
      title: 'Выручка сегодня',
      value: `${stats.todayRevenue.toLocaleString()} ${stats.currency}`,
      trend: stats.todaySales > 0 ? '+4.3%' : '0%',
      trendDir: stats.todaySales > 0 ? 'up' as const : 'down' as const,
      trendText: 'По сравнению со вчера',
      icon: DollarSign,
      iconColor: 'green',
      href: '/dashboard/sales',
    },
    {
      title: 'Открытые долги',
      value: stats.openDebtsCount.toLocaleString(),
      trend: stats.openDebtsCount > 0 ? `${stats.openDebtsAmount.toLocaleString()} ${stats.currency}` : '0',
      trendDir: stats.openDebtsCount > 0 ? 'down' as const : 'up' as const,
      trendText: 'Общая сумма долгов',
      icon: Clock,
      iconColor: 'orange',
      href: '/dashboard/debts',
    },
  ]

  const statusLabels: Record<string, string> = {
    delivered: 'Доставлено',
    pending: 'Ожидание',
    rejected: 'Отменено',
  }

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <h2 className="page-title">Дашборд</h2>

      {/* Stat Cards */}
      <div className="dashboard-stats-grid">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <Link key={card.title} href={card.href}>
              <div className="stat-card">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--muted-foreground)] mb-1">{card.title}</p>
                  <p className="text-2xl font-bold text-[var(--foreground)] mb-2 truncate">{card.value}</p>
                  <div className="flex items-center gap-1.5">
                    {card.trendDir === 'up' ? (
                      <TrendingUp className="w-3.5 h-3.5 trend-up" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 trend-down" />
                    )}
                    <span className={`text-xs font-medium ${card.trendDir === 'up' ? 'trend-up' : 'trend-down'}`}>
                      {card.trend}
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)]">{card.trendText}</span>
                  </div>
                </div>
                <div className={`stat-card-icon ${card.iconColor}`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Sales Details Chart */}
      <div className="chart-card">
        <div className="chart-card-header">
          <h3 className="chart-card-title">Детали продаж</h3>
          <select className="month-select">
            <option>Апрель</option>
            <option>Март</option>
            <option>Февраль</option>
            <option>Январь</option>
          </select>
        </div>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <AreaChart data={salesChartData}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4C6FFF" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#4C6FFF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  fontSize: '13px',
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#4C6FFF"
                strokeWidth={2.5}
                fill="url(#salesGradient)"
                dot={{ r: 0 }}
                activeDot={{ r: 6, fill: '#4C6FFF', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="chart-card">
        <div className="chart-card-header">
          <h3 className="chart-card-title">Выручка</h3>
          <select className="month-select">
            <option>Апрель</option>
            <option>Март</option>
            <option>Февраль</option>
          </select>
        </div>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <AreaChart data={revenueChartData}>
              <defs>
                <linearGradient id="revSalesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF6B6B" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#FF6B6B" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="revProfitGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7B61FF" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#7B61FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  fontSize: '13px',
                }}
              />
              <Area
                type="monotone"
                dataKey="sales"
                stroke="#FF6B6B"
                strokeWidth={2}
                fill="url(#revSalesGradient)"
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="profit"
                stroke="#7B61FF"
                strokeWidth={2}
                fill="url(#revProfitGradient)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: '#FF6B6B' }} />
            <span className="text-sm text-[var(--muted-foreground)]">Продажи</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: '#7B61FF' }} />
            <span className="text-sm text-[var(--muted-foreground)]">Прибыль</span>
          </div>
        </div>
      </div>

      {/* Deals Details Table */}
      <div className="chart-card">
        <div className="chart-card-header">
          <h3 className="chart-card-title">Детали сделок</h3>
          <select className="month-select">
            <option>Апрель</option>
            <option>Март</option>
            <option>Февраль</option>
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="deals-table">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Локация</th>
                <th>Дата - Время</th>
                <th>Кол-во</th>
                <th>Сумма</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {recentDeals.map((deal, index) => (
                <tr key={index}>
                  <td className="font-medium">{deal.product}</td>
                  <td className="text-[var(--muted-foreground)]">{deal.location}</td>
                  <td className="text-[var(--muted-foreground)]">{deal.date}</td>
                  <td>{deal.quantity}</td>
                  <td className="font-medium">{deal.amount}</td>
                  <td>
                    <span className={`status-badge ${deal.status}`}>
                      {statusLabels[deal.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Cards Row */}
      <div className="bottom-cards-grid">
        {/* Customers Card */}
        <Link href="/dashboard/customers">
          <div className="chart-card text-center cursor-pointer hover:shadow-md transition-shadow">
            <h3 className="chart-card-title mb-6">Клиенты</h3>
            <div className="flex items-center justify-center mb-6">
              <div className="relative">
                <svg width="140" height="140" viewBox="0 0 140 140">
                  <circle
                    cx="70"
                    cy="70"
                    r="55"
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="12"
                  />
                  <circle
                    cx="70"
                    cy="70"
                    r="55"
                    fill="none"
                    stroke="#4C6FFF"
                    strokeWidth="12"
                    strokeDasharray={`${(34249 / (34249 + 1420)) * 345.58} 345.58`}
                    strokeLinecap="round"
                    transform="rotate(-90 70 70)"
                  />
                </svg>
              </div>
            </div>
            <div className="flex items-center justify-center gap-8">
              <div>
                <p className="text-xl font-bold text-[var(--foreground)]">
                  {stats.totalLocations > 0 ? stats.totalLocations : '34,249'}
                </p>
                <p className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5 justify-center">
                  <span className="w-2 h-2 rounded-full bg-[#4C6FFF]" />
                  Новые
                </p>
              </div>
              <div>
                <p className="text-xl font-bold text-[var(--foreground)]">1,420</p>
                <p className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5 justify-center">
                  <span className="w-2 h-2 rounded-full bg-[#A5B4FC]" />
                  Постоянные
                </p>
              </div>
            </div>
          </div>
        </Link>

        {/* Low Stock Alert */}
        <div className="chart-card flex flex-col items-center justify-center text-center">
          <h3 className="chart-card-title mb-4">Низкий остаток</h3>
          <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 ${stats.lowStockCount > 0 ? 'bg-[#FFE0E0]' : 'bg-[#D4F5E9]'}`}>
            <AlertTriangle className={`w-10 h-10 ${stats.lowStockCount > 0 ? 'text-[#EF4444]' : 'text-[#00C49A]'}`} />
          </div>
          <p className="text-3xl font-bold text-[var(--foreground)] mb-1">{stats.lowStockCount}</p>
          <p className="text-sm text-[var(--muted-foreground)]">Товаров ниже минимума</p>
        </div>

        {/* Sales Analytics Mini Chart */}
        <div className="chart-card">
          <h3 className="chart-card-title mb-4">Аналитика продаж</h3>
          <div style={{ width: '100%', height: 150 }}>
            <ResponsiveContainer>
              <LineChart data={salesChartData}>
                <XAxis dataKey="name" hide />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#00C49A"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: '#00C49A' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between mt-2 text-sm text-[var(--muted-foreground)]">
            <span>Янв</span>
            <span>Фев</span>
            <span>Мар</span>
            <span>Апр</span>
          </div>
        </div>
      </div>

      {/* Second Stats Row */}
      <div className="dashboard-stats-grid">
        <div className="stat-card">
          <div className="flex-1">
            <p className="text-sm text-[var(--muted-foreground)] mb-1">Продажи сегодня</p>
            <p className="text-2xl font-bold text-[var(--foreground)] mb-2">{stats.todaySales}</p>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 trend-up" />
              <span className="text-xs font-medium trend-up">+2.5%</span>
              <span className="text-xs text-[var(--muted-foreground)]">Кол-во чеков</span>
            </div>
          </div>
          <div className="stat-card-icon blue">
            <ShoppingCart className="w-6 h-6" />
          </div>
        </div>

        <div className="stat-card">
          <div className="flex-1">
            <p className="text-sm text-[var(--muted-foreground)] mb-1">Остаток (себестоимость)</p>
            <p className="text-2xl font-bold text-[var(--foreground)] mb-2 truncate">
              {stats.totalInventoryValue.toFixed(0)} {stats.currency}
            </p>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 trend-up" />
              <span className="text-xs font-medium trend-up">Стоимость запасов</span>
            </div>
          </div>
          <div className="stat-card-icon green">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="stat-card">
          <div className="flex-1">
            <p className="text-sm text-[var(--muted-foreground)] mb-1">Локации</p>
            <p className="text-2xl font-bold text-[var(--foreground)] mb-2">{stats.totalLocations}</p>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
              <span className="text-xs text-[var(--muted-foreground)]">Склады и магазины</span>
            </div>
          </div>
          <div className="stat-card-icon red">
            <MapPin className="w-6 h-6" />
          </div>
        </div>

        <div className="stat-card">
          <div className="flex-1">
            <p className="text-sm text-[var(--muted-foreground)] mb-1">Низкий остаток</p>
            <p className={`text-2xl font-bold mb-2 ${stats.lowStockCount > 0 ? 'text-[#EF4444]' : 'text-[var(--foreground)]'}`}>
              {stats.lowStockCount}
            </p>
            <div className="flex items-center gap-1.5">
              {stats.lowStockCount > 0 ? (
                <TrendingDown className="w-3.5 h-3.5 trend-down" />
              ) : (
                <TrendingUp className="w-3.5 h-3.5 trend-up" />
              )}
              <span className="text-xs text-[var(--muted-foreground)]">Товаров ниже минимума</span>
            </div>
          </div>
          <div className="stat-card-icon orange">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>
    </div>
  )
}
