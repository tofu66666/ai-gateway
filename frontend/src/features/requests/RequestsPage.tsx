import { ListOrdered } from 'lucide-react'
import { EmptyState } from '@/components/layout/EmptyState'

export function RequestsPage() {
  return (
    <EmptyState icon={ListOrdered} title="Requests is not built yet">
      Every call with its tokens, cost and status, with filters and pages.
      <br />
      H18IALMOND-13
    </EmptyState>
  )
}
