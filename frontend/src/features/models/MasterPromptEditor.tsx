import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { queryKeys } from '@/api/hooks'
import { updateModelPrompt, type Model } from '@/api/projects'
import { Button } from '@/components/ui/button'
import { MAX_PROMPT_LENGTH } from './masterPrompt'
import { PromptField } from './PromptField'

// H18IALMOND-56: admins set, change or remove the instructions the gateway
// puts before every chat request to this model (H18IALMOND-17). The editor
// opens in the model's card (client meeting, Tue 10 Nov 2026).
export function MasterPromptEditor({ model }: { model: Model }) {
  const saved = model.prompt ?? ''
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState(saved)
  const editButton = useRef<HTMLButtonElement>(null)
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: (next: string | null) => updateModelPrompt(model.id, next),
    onSuccess: (_, next) => {
      toast.success(
        next
          ? `Master prompt saved for "${model.alias}"`
          : `Master prompt removed from "${model.alias}"`,
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.models })
      close()
    },
  })

  const next = prompt.trim()

  function edit() {
    setPrompt(saved)
    save.reset()
    setOpen(true)
  }

  // Back to the summary, with focus on its Edit button.
  function close() {
    setOpen(false)
    requestAnimationFrame(() => editButton.current?.focus())
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    save.mutate(next || null)
  }

  if (open) {
    return (
      <form onSubmit={handleSubmit} className="space-y-3 border-t pt-4">
        <PromptField
          id={`prompt-${model.id}`}
          value={prompt}
          onChange={setPrompt}
          autoFocus
        />

        {save.isError && (
          <p className="text-sm text-destructive">{save.error.message}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={
              save.isPending ||
              next === saved.trim() ||
              prompt.length > MAX_PROMPT_LENGTH
            }
          >
            {save.isPending
              ? 'Saving...'
              : next
                ? 'Save'
                : 'Remove master prompt'}
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="space-y-1 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Master prompt</p>
        <Button ref={editButton} size="sm" variant="ghost" onClick={edit}>
          <Pencil />
          {saved ? 'Edit' : 'Set'}
          <span className="sr-only"> the master prompt for {model.alias}</span>
        </Button>
      </div>
      <p className="line-clamp-3 text-sm wrap-break-word whitespace-pre-wrap">
        {saved || (
          <span className="text-muted-foreground">
            None: chat requests reach the model as they are sent.
          </span>
        )}
      </p>
    </div>
  )
}
