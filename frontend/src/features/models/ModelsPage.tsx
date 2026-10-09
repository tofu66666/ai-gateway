import { Boxes } from 'lucide-react'
import { EmptyState } from '@/components/layout/EmptyState'

export function ModelsPage() {
  return (
    <EmptyState icon={Boxes} title="Models is not built yet">
      Model aliases with input and output prices; admins also add models.
      <br />
      H18IALMOND-50, -53
    </EmptyState>
  )
}
