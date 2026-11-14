import { TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

// Shown with a new raw key, which the platform does not keep.
export function OneTimeKeyNotice() {
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900 [&>svg]:text-amber-600">
      <TriangleAlert />
      <AlertTitle>Copy this key now</AlertTitle>
      <AlertDescription className="text-amber-900/80">
        You won't be able to see it again: the platform keeps only its hash.
      </AlertDescription>
    </Alert>
  )
}
