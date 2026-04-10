'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getTransactionTypeLabel, getTransactionTypeBadgeColor } from '@/lib/utils/transaction-utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import { Download } from 'lucide-react'

interface Transaction {
  id: string
  type: string
  total_amount: number
  currency: string
  created_at: string
  notes: string | null
  locations_to: { name: string } | null
  locations_from: { name: string } | null
  transaction_items: Array<{
    quantity: number
    price: number
    currency: string
    products: { name: string; sku: string }
  }>
}

const COLORS = ['#27AE60', '#2F80ED', '#F2994A', '#EB5757', '#9B51E0']

export default function ReportsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalLocations: 0,
    totalTransactions: 0,
    totalInventoryValue: 0,
    totalSales: 0,
    totalExpenses: 0,
    totalArrivals: 0,
    currency: 'UZS',
  })
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedTransaction, setExpandedTransaction] = useState<string | null>(null)
  const [salesByDay, setSalesByDay] = useState<any[]>([])
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [transactionsByType, setTransactionsByType] = useState<any[]>([])

  useEffect(() => {
    if (!authLoading && !user) router.push('/login')
  }, [user, authLoading, router])

  useEffect(() => {
    if (user) fetchStats()
  }, [user])

  const fetchStats = async () => {
    try {
      const { count: productsCount } = await supabase.from('products').select('*', { count: 'exact', head: true })
      const { count: locationsCount } = await supabase.from('locations').select('*', { count: 'exact', head: true })
      const { count: transactionsCount } = await supabase.from('transactions').select('*', { count: 'exact', head: true })

      const { data: inventory } = await supabase.from('inventory').select(`quantity, products(purchase_price, currency)`)
      let totalValue = 0
      let currency = 'UZS'
      if (inventory) {
        totalValue = inventory.reduce((sum: number, item: any) => {
          currency = item.products?.currency || 'UZS'
          return sum + (item.quantity * (item.products?.purchase_price || 0))
        }, 0)
      }

      const { data: allTx } = await supabase.from('transactions').select('type, total_amount, created_at, currency')
      let totalSales = 0, totalExpenses = 0, totalArrivals = 0
      if (allTx) {
        allTx.forEach((tx: any) => {
          if (tx.type === 'sale') totalSales += tx.total_amount || 0
          if (tx.type === 'expense') totalExpenses += tx.total_amount || 0
          if (tx.type === 'arrival') totalArrivals += tx.total_amount || 0
        })
      }

      setStats({
        totalProducts: productsCount || 0,
        totalLocations: locationsCount || 0,
        totalTransactions: transactionsCount || 0,
        totalInventoryValue: totalValue,
        totalSales,
        totalExpenses,
        totalArrivals,
        currency,
      })

      const { data: recent } = await supabase
        .from('transactions')
        .select(`*, locations_to:to_location_id(name), locations_from:from_location_id(name), transaction_items(quantity, price, currency, products(name, sku))`)
        .order('created_at', { ascending: false })
        .limit(10)
      setRecentTransactions(recent || [])

      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const { data: salesData } = await supabase
        .from('transactions')
        .select('total_amount, created_at')
        .eq('type', 'sale')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: true })

      if (salesData) {
        const byDay: Record<string, number> = {}
        salesData.forEach((s: any) => {
          const day = new Date(s.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
          byDay[day] = (byDay[day] || 0) + (s.total_amount || 0)
        })
        setSalesByDay(Object.entries(byDay).map(([date, amount]) => ({ date, amount })))
      }

      const { data: itemsData } = await supabase
        .from('transaction_items')
        .select(`quantity, products(name)`)
        .in('transaction_id', (allTx || []).filter((t: any) => t.type === 'sale').map((t: any) => t.id))

      if (itemsData) {
        const byProduct: Record<string, number> = {}
        itemsData.forEach((item: any) => {
          const name = item.products?.name || 'Unknown'
          byProduct[name] = (byProduct[name] || 0) + item.quantity
        })
        const sorted = Object.entries(byProduct)
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, 5)
          .map(([name, quantity]) => ({ name, quantity }))
        setTopProducts(sorted)
      }

      const typeCounts: Record<string, number> = { arrival: 0, sale: 0, transfer: 0, expense: 0 }
      if (allTx) {
        allTx.forEach((tx: any) => {
          if (typeCounts[tx.type] !== undefined) typeCounts[tx.type]++
        })
      }
      setTransactionsByType(Object.entries(typeCounts).map(([name, value]) => ({ name: getTransactionTypeLabel(name), value })))
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const exportToCSV = () => {
    const headers = ['Дата', 'Тип', 'Сумма', 'Валюта', 'Примечание']
    const rows = recentTransactions.map(tx => [
      new Date(tx.created_at).toLocaleDateString('ru-RU'),
      getTransactionTypeLabel(tx.type),
      tx.total_amount,
      tx.currency,
      tx.notes || '',
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'transactions.csv'
    link.click()
  }

  const toggleTransaction = (id: string) => setExpandedTransaction(expandedTransaction === id ? null : id)

  if (authLoading || loading) return <div className="flex items-center justify-center min-h-screen"><div className="text-lg">Загрузка...</div></div>
  if (!user) return null

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Отчеты</h1>
          <p className="mt-2 text-muted-foreground">Аналитика и статистика</p>
        </div>
        <Button onClick={exportToCSV}><Download className="w-4 h-4 mr-1" /> Экспорт CSV</Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader><CardDescription>Всего товаров</CardDescription><CardTitle className="text-3xl">{stats.totalProducts}</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">В каталоге</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardDescription>Общая стоимость</CardDescription><CardTitle className="text-3xl">{stats.totalInventoryValue.toFixed(0)} {stats.currency}</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Остатки на складах</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardDescription>Продажи</CardDescription><CardTitle className="text-3xl" style={{ color: '#27AE60' }}>{stats.totalSales.toFixed(0)}</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Общая выручка</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardDescription>Расходы</CardDescription><CardTitle className="text-3xl" style={{ color: '#EB5757' }}>{stats.totalExpenses.toFixed(0)}</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Общие расходы</p></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Динамика продаж (30 дней)</CardTitle></CardHeader>
          <CardContent>
            {salesByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={salesByDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="amount" stroke="#27AE60" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-muted-foreground text-center py-8">Нет данных</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Топ товаров</CardTitle></CardHeader>
          <CardContent>
            {topProducts.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topProducts}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="quantity" fill="#2F80ED" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-muted-foreground text-center py-8">Нет данных</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Транзакции по типам</CardTitle></CardHeader>
          <CardContent>
            {transactionsByType.some(t => t.value > 0) ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={transactionsByType} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={100} fill="#8884d8" dataKey="value">
                    {transactionsByType.map((entry, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-muted-foreground text-center py-8">Нет данных</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Последние транзакции</CardTitle><CardDescription>10 последних операций</CardDescription></CardHeader>
          <CardContent>
            {recentTransactions.length === 0 ? (
              <p className="text-muted-foreground">Нет транзакций</p>
            ) : (
              <div className="space-y-2">
                {recentTransactions.map((tx) => (
                  <div key={tx.id} className="border rounded-lg overflow-hidden">
                    <div onClick={() => toggleTransaction(tx.id)} className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Badge className={getTransactionTypeBadgeColor(tx.type)}>{getTransactionTypeLabel(tx.type)}</Badge>
                        <p className="text-sm text-muted-foreground">{new Date(tx.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="font-semibold">{tx.total_amount.toFixed(2)} {tx.currency}</p>
                        <span className="text-muted-foreground">{expandedTransaction === tx.id ? '▼' : '▶'}</span>
                      </div>
                    </div>
                    {expandedTransaction === tx.id && (tx.transaction_items?.length ?? 0) > 0 && (
                      <div className="bg-muted/30 p-4 border-t space-y-2">
                        {(tx.transaction_items || []).map((item, i) => (
                          <div key={i} className="flex justify-between items-center bg-card p-2 rounded">
                            <div><p className="font-medium">{item.products.name}</p><p className="text-sm text-muted-foreground">{item.products.sku}</p></div>
                            <p className="font-medium">{item.quantity} шт × {item.price} {item.currency}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
