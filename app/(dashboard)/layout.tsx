'use client'

import { Sidebar } from '@/components/dashboard/sidebar'
import { TopHeader } from '@/components/dashboard/top-header'
import { useAuth } from '@/lib/auth/auth-context'
import { useState } from 'react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSignOut={signOut}
      />
      <div className="dashboard-content">
        <TopHeader onMenuClick={() => setSidebarOpen(prev => !prev)} />
        <div className="page-content">
          {children}
        </div>
      </div>
    </div>
  )
}
