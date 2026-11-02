import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { queryKeys } from '@/api/hooks'
import { updateModelPrompt, type Model } from '@/api/projects'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { hasMasterPrompt, MAX_PROMPT_LENGTH } from './masterPrompt'
import { PromptField } from './PromptField'

// H18IALMOND-56: admins set, change or remove the instructions the gateway
// puts before every chat request to this model (H18IALMOND-17).
export function MasterPromptDialog({ model }: { model: Model }) {
  const saved = model.prompt ?? ''
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState(saved)
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
      setOpen(false)
    },
  })

  const next = prompt.trim()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    save.mutate(next || null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
        setPrompt(saved)
        save.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil />
          {hasMasterPrompt(model) ? 'Edit master prompt' : 'Set master prompt'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Master prompt for {model.alias}</DialogTitle>
            <DialogDescription>
              Every chat request to this model starts with it, whoever sends it.
              Empty the box to remove it.
            </DialogDescription>
          </DialogHeader>

          <PromptField
            id={`prompt-${model.id}`}
            value={prompt}
            onChange={setPrompt}
          />

          {save.isError && (
            <p className="text-sm text-destructive">{save.error.message}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
