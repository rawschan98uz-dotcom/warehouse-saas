import { DashboardNav } from '@/components/dashboard/dashboard-nav'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#EEF4FB' }}>
      <DashboardNav />
      <main className="py-4 sm:py-6">
        <div className="mx-auto px-3 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
