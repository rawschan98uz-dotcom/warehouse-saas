'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Menu, Moon, Sun, X } from 'lucide-react'
import { useState } from 'react'

const navigation = [
  { name: 'Дашборд', href: '/dashboard' },
  { name: 'Товары', href: '/dashboard/products' },
  { name: 'Инвентаризация', href: '/dashboard/inventory-check' },
  { name: 'Продажи', href: '/dashboard/sales' },
  { name: 'Клиенты', href: '/dashboard/customers' },
  { name: 'Долги', href: '/dashboard/debts' },
  { name: 'Оплаты', href: '/dashboard/payment-methods' },
  { name: 'Транзакции', href: '/dashboard/transactions' },
  { name: 'Локации', href: '/dashboard/locations' },
  { name: 'Поставщики', href: '/dashboard/suppliers' },
  { name: 'Отчеты', href: '/dashboard/reports' },
]

export function DashboardNav() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )

  const toggleDarkMode = () => {
    const newDark = !darkMode
    setDarkMode(newDark)
    if (newDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const getInitials = (email: string) => {
    return email.substring(0, 2).toUpperCase()
  }

  return (
    <nav
      className="border-b"
      style={{
        borderColor: '#2b4b6d',
        background: 'linear-gradient(100deg, #011931 0%, #0b2945 45%, #143250 100%)',
      }}
    >
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/dashboard" className="text-xl font-bold text-white">
                Nuriddin
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-4">
              {navigation.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-[#0055FF]/35 text-white'
                        : 'text-white/75 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="sm:hidden text-white hover:bg-white/10"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleDarkMode} className="text-white hover:bg-white/10">
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger className="relative h-10 w-10 rounded-full border-0 bg-transparent hover:bg-white/10 p-0">
                <Avatar>
                  <AvatarFallback className="bg-white/20 text-white">{user?.email ? getInitials(user.email) : 'U'}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Link href="/dashboard/settings">Настройки</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => signOut()}>
                  Выйти
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="sm:hidden pb-3 space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#0055FF]/35 text-white'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.name}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </nav>
  )
}
