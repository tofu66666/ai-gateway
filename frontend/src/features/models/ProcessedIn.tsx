import { Globe } from 'lucide-react'
import type { Model } from '@/api/projects'

// H18IALMOND-40: where a model's provider processes the data, beside the model
// wherever one is chosen. A region cannot be enforced, so the client asked for
// it to be shown instead (meeting of Mon 19 Oct 2026).
export function ProcessedIn({ model }: { model: Model }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Globe aria-hidden className="size-3.5" />
      <span className="sr-only">, data processed in </span>
      {model.data_processing_country || 'Not specified'}
    </span>
  )
}
