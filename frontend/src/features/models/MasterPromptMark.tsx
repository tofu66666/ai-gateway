import { MessageSquareText } from 'lucide-react'
import type { Model } from '@/api/projects'
import { hasMasterPrompt } from './masterPrompt'

// H18IALMOND-56: beside a model wherever one is chosen, like ProcessedIn, so a
// team lead picking a project's or a key's models sees which ones start every
// chat with a master prompt.
export function MasterPromptMark({ model }: { model: Model }) {
  if (!hasMasterPrompt(model)) {
    return null
  }

  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <MessageSquareText aria-hidden className="size-3.5" />
      <span className="sr-only">, has a </span>
      Master prompt
    </span>
  )
}
