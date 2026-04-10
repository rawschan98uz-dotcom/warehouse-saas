'use client'

import { useAuth } from '@/lib/auth/auth-context'
import { Search, Sun, Moon, Menu } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NotificationsDropdown } from '@/components/dashboard/notifications'
import Link from 'next/link'
import { useState, useEffect } from 'react'

interface TopHeaderProps {
  onMenuClick: () => void
}

export function TopHeader({ onMenuClick }: TopHeaderProps) {
  const { user, signOut } = useAuth()
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    setDarkMode(document.documentElement.classList.contains('dark'))
  }, [])

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

  const getUserName = (email: string) => {
    const name = email.split('@')[0]
    return name.charAt(0).toUpperCase() + name.slice(1)
  }

  return (
    <header className="top-header">
      <div className="flex items-center gap-4">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="notification-btn lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Search */}
        <div className="search-box">
          <Search className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" />
          <input type="text" placeholder="Поиск..." />
        </div>
      </div>

      <div className="header-actions">
        {/* Dark mode toggle */}
        <button onClick={toggleDarkMode} className="notification-btn">
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Notifications */}
        <NotificationsDropdown />

        {/* User profile */}
        <DropdownMenu>
          <DropdownMenuTrigger className="user-profile border-0 bg-transparent cursor-pointer outline-none">
              <div className="user-avatar">
                {user?.email ? getInitials(user.email) : 'U'}
              </div>
              <div className="user-info">
                <span className="user-name">
                  {user?.email ? getUserName(user.email) : 'Пользователь'}
                </span>
                <span className="user-role">Админ</span>
              </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-3 py-2 border-b border-[var(--border)]">
              <p className="text-sm font-medium truncate">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer">
              <Link href="/dashboard/settings" className="w-full">
                Настройки
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => signOut()}
              className="text-red-500 cursor-pointer"
            >
              Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
