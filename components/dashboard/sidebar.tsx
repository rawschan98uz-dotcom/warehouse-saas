'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Package,
  ClipboardCheck,
  ShoppingCart,
  Users,
  Landmark,
  CreditCard,
  ArrowLeftRight,
  MapPin,
  Truck,
  BarChart3,
  Settings,
  LogOut,
} from 'lucide-react'

const mainNavigation = [
  { name: 'Дашборд', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Товары', href: '/dashboard/products', icon: Package },
  { name: 'Инвентаризация', href: '/dashboard/inventory-check', icon: ClipboardCheck },
  { name: 'Продажи', href: '/dashboard/sales', icon: ShoppingCart },
  { name: 'Клиенты', href: '/dashboard/customers', icon: Users },
  { name: 'Долги', href: '/dashboard/debts', icon: Landmark },
  { name: 'Оплаты', href: '/dashboard/payment-methods', icon: CreditCard },
  { name: 'Транзакции', href: '/dashboard/transactions', icon: ArrowLeftRight },
  { name: 'Локации', href: '/dashboard/locations', icon: MapPin },
  { name: 'Поставщики', href: '/dashboard/suppliers', icon: Truck },
  { name: 'Отчеты', href: '/dashboard/reports', icon: BarChart3 },
]

const pagesNavigation = [
  { name: 'Настройки', href: '/dashboard/settings', icon: Settings },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  onSignOut: () => void
}

export function Sidebar({ isOpen, onClose, onSignOut }: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${isOpen ? 'active' : ''}`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <span className="accent">Nur</span>iddin
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {mainNavigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href + '/'))
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <Icon />
                {item.name}
              </Link>
            )
          })}

          <div className="sidebar-section-label">Страницы</div>

          {pagesNavigation.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <Icon />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <button
            onClick={onSignOut}
            className="sidebar-link w-full text-left"
            style={{ color: '#EF4444' }}
          >
            <LogOut />
            Выйти
          </button>
        </div>
      </aside>
    </>
  )
}
