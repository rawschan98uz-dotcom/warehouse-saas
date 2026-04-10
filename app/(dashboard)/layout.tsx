import { DashboardNav } from '@/components/dashboard/dashboard-nav'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#D3E0EF] to-[#FFFFFF] dark:from-[#000000] dark:to-[#011931]">
      <DashboardNav />
      <main className="py-6 sm:py-8">
        <div className="mx-auto px-3 sm:px-6 lg:px-8 max-w-[1400px]">
          <div className="bg-white/80 dark:bg-[#011931]/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 dark:border-[#2b4b6d] p-4 sm:p-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
