'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import { createClient } from '@/lib/supabase/client'
import { resolveOrganizationId } from '@/lib/org/resolve-org-id'
import {
  Bell,
  AlertTriangle,
  TrendingUp,
  Package,
  X,
  Check,
  CheckCheck,
} from 'lucide-react'
import Link from 'next/link'

interface Notification {
  id: string
  type: 'low_stock' | 'sale' | 'debt' | 'arrival'
  title: string
  message: string
  href: string
  time: string
  read: boolean
}

export function NotificationsDropdown() {
  const { user, organizationId } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const fetchNotifications = useCallback(async () => {
    if (!user) return
    setLoading(true)

    try {
      const orgId = await resolveOrganizationId(supabase, organizationId)
      const notifs: Notification[] = []

      // 1. Low stock alerts
      const { data: inventoryData } = await supabase
        .from('inventory')
        .select('quantity, products(id, name, sku, min_stock_level)')
        .eq('organization_id', orgId)

      if (inventoryData) {
        for (const row of inventoryData) {
          const product = Array.isArray(row.products) ? row.products[0] : row.products
          if (!product) continue
          const qty = Number(row.quantity || 0)
          const minStock = Number(product.min_stock_level || 0)
          if (minStock > 0 && qty <= minStock) {
            notifs.push({
              id: `low_stock_${product.id}`,
              type: 'low_stock',
              title: 'Низкий остаток',
              message: `${product.name} (${product.sku}): осталось ${qty} шт. (мин: ${minStock})`,
              href: '/dashboard/products',
              time: 'Сейчас',
              read: false,
            })
          }
        }
      }

      // 2. Recent transactions (last 24h)
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      const { data: txData } = await supabase
        .from('transactions')
        .select('id, type, total_amount, currency, created_at, notes')
        .eq('organization_id', orgId)
        .gte('created_at', yesterday.toISOString())
        .order('created_at', { ascending: false })
        .limit(5)

      if (txData) {
        const typeLabels: Record<string, string> = {
          sale: 'Продажа',
          arrival: 'Поступление',
          transfer: 'Перевод',
          expense: 'Расход',
        }
        for (const tx of txData) {
          const createdAt = new Date(tx.created_at)
          const diffMs = Date.now() - createdAt.getTime()
          const diffMin = Math.floor(diffMs / 60000)
          let timeLabel: string
          if (diffMin < 1) timeLabel = 'Только что'
          else if (diffMin < 60) timeLabel = `${diffMin} мин. назад`
          else {
            const diffHours = Math.floor(diffMin / 60)
            timeLabel = `${diffHours} ч. назад`
          }

          notifs.push({
            id: `tx_${tx.id}`,
            type: tx.type === 'arrival' ? 'arrival' : 'sale',
            title: typeLabels[tx.type] || tx.type,
            message: `${Number(tx.total_amount).toLocaleString()} ${tx.currency}${tx.notes ? ` — ${tx.notes}` : ''}`,
            href: '/dashboard/transactions',
            time: timeLabel,
            read: false,
          })
        }
      }

      // 3. Open debts
      try {
        const { data: debtsData } = await supabase
          .from('customer_debts')
          .select('id, customers(name), outstanding_amount, currency, due_date')
          .in('status', ['open', 'partially_paid'])
          .limit(3)

        if (debtsData) {
          for (const debt of debtsData) {
            const customer = Array.isArray(debt.customers) ? debt.customers[0] : debt.customers
            const customerName = customer?.name || 'Клиент'
            const dueDate = debt.due_date ? new Date(debt.due_date) : null
            const isOverdue = dueDate && dueDate < new Date()

            notifs.push({
              id: `debt_${debt.id}`,
              type: 'debt',
              title: isOverdue ? 'Просроченный долг' : 'Открытый долг',
              message: `${customerName}: ${Number(debt.outstanding_amount).toLocaleString()} ${debt.currency || 'UZS'}`,
              href: '/dashboard/debts',
              time: isOverdue ? 'Просрочен' : (dueDate ? `До ${dueDate.toLocaleDateString('ru-RU')}` : ''),
              read: false,
            })
          }
        }
      } catch {
        // customer_debts table might not exist
      }

      // Load read state from localStorage
      const readIds = JSON.parse(localStorage.getItem('readNotifications') || '[]') as string[]
      for (const notif of notifs) {
        if (readIds.includes(notif.id)) {
          notif.read = true
        }
      }

      setNotifications(notifs)
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }, [user, organizationId, supabase])

  // Fetch on mount and every 60 seconds
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
    const readIds = JSON.parse(localStorage.getItem('readNotifications') || '[]') as string[]
    if (!readIds.includes(id)) {
      readIds.push(id)
      localStorage.setItem('readNotifications', JSON.stringify(readIds))
    }
  }

  const markAllAsRead = () => {
    const readIds = notifications.map((n) => n.id)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    localStorage.setItem('readNotifications', JSON.stringify(readIds))
  }

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'low_stock':
        return <AlertTriangle className="w-4 h-4" style={{ color: '#FF8C42' }} />
      case 'sale':
        return <TrendingUp className="w-4 h-4" style={{ color: '#00C49A' }} />
      case 'arrival':
        return <Package className="w-4 h-4" style={{ color: '#4C6FFF' }} />
      case 'debt':
        return <AlertTriangle className="w-4 h-4" style={{ color: '#EF4444' }} />
    }
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Bell Button */}
      <button
        className="notification-btn"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 380,
            maxHeight: 500,
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.15)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column' as const,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)' }}>
                Уведомления
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: '#4C6FFF',
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: 10,
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  title="Отметить все как прочитанные"
                  style={{
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--muted-foreground)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--secondary)'
                    e.currentTarget.style.color = '#4C6FFF'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = 'var(--muted-foreground)'
                  }}
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--muted-foreground)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--secondary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && notifications.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    border: '2px solid #4C6FFF',
                    borderTop: '2px solid transparent',
                    borderRadius: '50%',
                    margin: '0 auto 12px',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <p style={{ fontSize: 13 }}>Загрузка...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                <Bell className="w-8 h-8" style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                <p style={{ fontSize: 13 }}>Нет уведомлений</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <Link
                  key={notif.id}
                  href={notif.href}
                  onClick={() => {
                    markAsRead(notif.id)
                    setIsOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                    textDecoration: 'none',
                    position: 'relative',
                    backgroundColor: !notif.read ? 'rgba(76, 111, 255, 0.05)' : 'transparent',
                    borderLeft: !notif.read ? '3px solid #4C6FFF' : '3px solid transparent',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--secondary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = !notif.read ? 'rgba(76, 111, 255, 0.05)' : 'transparent'
                  }}
                >
                  {/* Icon */}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: 'var(--secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {getIcon(notif.type)}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 2 }}>
                      {notif.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--muted-foreground)',
                        lineHeight: 1.4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {notif.message}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4, opacity: 0.7 }}>
                      {notif.time}
                    </div>
                  </div>

                  {/* Mark as read button */}
                  {!notif.read && (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        markAsRead(notif.id)
                      }}
                      title="Отметить как прочитанное"
                      style={{
                        width: 28,
                        height: 28,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 6,
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--muted-foreground)',
                        cursor: 'pointer',
                        flexShrink: 0,
                        marginTop: 4,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#D4F5E9'
                        e.currentTarget.style.color = '#00B69B'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                        e.currentTarget.style.color = 'var(--muted-foreground)'
                      }}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
