import { SearchX } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/layout/EmptyState'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <EmptyState icon={SearchX} title="Page not found">
      <Button asChild variant="link">
        <Link to="/overview">Back to Overview</Link>
      </Button>
    </EmptyState>
  )
}
