import { CircleAlert } from 'lucide-react'
import { ApiError } from '@/api/client'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

// A failed request. It names the call and the answer, so a screenshot is
// enough to report it.
export function ErrorState({ title, error }: { title: string; error: Error }) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {error instanceof ApiError
          ? `${error.request}: ${error.status} ${error.message}`
          : error.message}
      </AlertDescription>
    </Alert>
  )
}
