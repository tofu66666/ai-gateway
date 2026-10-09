import { LayoutDashboard } from 'lucide-react'
import { EmptyState } from '@/components/layout/EmptyState'
import { timeWindows, useTimeWindow } from '@/lib/time-window'

export function OverviewPage() {
  const { timeWindow } = useTimeWindow()
  const label = timeWindows.find((option) => option.value === timeWindow)?.label

  return (
    <EmptyState icon={LayoutDashboard} title="Overview is not built yet">
      Usage, spend by model and team totals for {label?.toLowerCase()}.
      <br />
      H18IALMOND-12, -14
    </EmptyState>
  )
}
