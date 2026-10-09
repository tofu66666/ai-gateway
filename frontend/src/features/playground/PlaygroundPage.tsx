import { MessageSquareText } from 'lucide-react'
import { EmptyState } from '@/components/layout/EmptyState'

export function PlaygroundPage() {
  return (
    <EmptyState icon={MessageSquareText} title="Playground is not built yet">
      Pick a project, paste a key, choose a model and send a prompt.
      <br />
      H18IALMOND-11
    </EmptyState>
  )
}
