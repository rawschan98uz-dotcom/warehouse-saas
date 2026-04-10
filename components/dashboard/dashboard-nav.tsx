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
      className="border-b border-white/20 backdrop-blur-md"
      style={{
        background: 'linear-gradient(135deg, #011931 0%, #0b2945 45%, #143250 100%)',
      }}
    >
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/dashboard" className="text-xl font-bold text-white flex items-center">
                <span className="bg-[#0055FF] text-white rounded-lg px-2 py-1 mr-2 text-sm">N</span>
                Nuriddin
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-2">
              {navigation.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                      isActive
                        ? 'bg-white/20 text-white shadow-inner'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
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
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleDarkMode} className="text-white hover:bg-white/10">
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger className="relative h-10 w-10 rounded-full border-0 bg-transparent hover:bg-white/10 p-0">
                <Avatar>
                  <AvatarFallback className="bg-[#0055FF]/20 text-white border border-white/20">{user?.email ? getInitials(user.email) : 'U'}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#011931] border-[#2b4b6d] text-white">
                <div className="px-3 py-2 border-b border-[#2b4b6d]">
                  <p className="text-sm font-medium truncate max-w-[160px]">{user?.email}</p>
                </div>
                <DropdownMenuSeparator className="bg-[#2b4b6d]" />
                <DropdownMenuItem className="hover:bg-[#0055FF]/20">
                  <Link href="/dashboard/settings" className="w-full">Настройки</Link>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => signOut()}
                  className="hover:bg-red-500/20 text-red-400"
                >
                  Выйти
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="sm:hidden pb-4 pt-2 space-y-1 border-t border-white/10">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block rounded-lg mx-2 px-4 py-3 text-base font-medium transition-colors ${
                    isActive
                      ? 'bg-white/20 text-white shadow-inner'
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
