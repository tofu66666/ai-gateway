import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { toast } from 'sonner'
import { queryKeys } from '@/api/hooks'
import { createModel } from '@/api/projects'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_PROMPT_LENGTH } from './masterPrompt'
import { PromptField } from './PromptField'

const empty = {
  alias: '',
  provider: 'google',
  model: '',
  input: '',
  output: '',
  country: '',
  prompt: '',
}

// H18IALMOND-53: callers ask for the alias; the provider and its model name
// stay hidden from everyone but admins.
export function AddModelDialog() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const queryClient = useQueryClient()

  const add = useMutation({
    mutationFn: createModel,
    onSuccess: (model) => {
      toast.success(`Model "${model.alias}" added`)
      queryClient.invalidateQueries({ queryKey: queryKeys.models })
      setOpen(false)
      setForm(empty)
    },
  })

  function field(name: keyof typeof empty) {
    return {
      id: `model-${name}`,
      value: form[name],
      onChange: (event: ChangeEvent<HTMLInputElement>) =>
        setForm({ ...form, [name]: event.target.value }),
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const prompt = form.prompt.trim()
    add.mutate({
      alias: form.alias.trim(),
      provider: form.provider.trim(),
      model: form.model.trim(),
      price_per_1m_input: Number(form.input),
      price_per_1m_output: Number(form.output),
      data_processing_country: form.country.trim() || null,
      // Sent only when typed, so a model without one can still be added while
      // the backend does not take prompts yet (H18IALMOND-57).
      ...(prompt ? { prompt } : {}),
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        add.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          Add model
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add model</DialogTitle>
            <DialogDescription>
              Callers use the alias. Only admins see the provider and its model
              name.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="model-alias">Alias</Label>
            <Input {...field('alias')} placeholder="gemini-flash" required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="model-provider">Provider</Label>
              <Input {...field('provider')} required />
              <p className="text-xs text-muted-foreground">
                The gateway can call "google" today.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-model">Provider's model name</Label>
              <Input
                {...field('model')}
                placeholder="gemini-2.5-flash"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-input">Input, USD per 1M tokens</Label>
              <Input
                {...field('input')}
                type="number"
                min="0"
                step="any"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-output">Output, USD per 1M tokens</Label>
              <Input
                {...field('output')}
                type="number"
                min="0"
                step="any"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model-country">Data processing country</Label>
            <Input {...field('country')} placeholder="Optional" />
          </div>

          <PromptField
            id="model-prompt"
            value={form.prompt}
            onChange={(prompt) => setForm({ ...form, prompt })}
          />

          {add.isError && (
            <p className="text-sm text-destructive">{add.error.message}</p>
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
              disabled={add.isPending || form.prompt.length > MAX_PROMPT_LENGTH}
            >
              {add.isPending ? 'Adding...' : 'Add model'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
