import OverviewNav from '@/components/OverviewNav'
import { AppSplitLayout } from '@/components/app-shell'

export default function OverviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppSplitLayout>
      <OverviewNav />
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </AppSplitLayout>
  )
}
