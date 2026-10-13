import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { queryKeys, useModels } from '@/api/hooks'
import { createProject } from '@/api/projects'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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

// H18IALMOND-52: a project belongs to a team and can only call the models it allows.
export function CreateProjectDialog({ teamId }: { teamId: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [modelIds, setModelIds] = useState<string[]>([])
  const models = useModels()
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      toast.success(`Project "${project.name}" created`)
      queryClient.invalidateQueries({ queryKey: queryKeys.allProjects })
      setOpen(false)
      setName('')
      setBudget('')
      setModelIds([])
    },
  })

  function toggleModel(id: string, checked: boolean) {
    setModelIds((ids) =>
      checked ? [...ids, id] : ids.filter((other) => other !== id),
    )
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    create.mutate({
      team_id: teamId,
      name: name.trim(),
      model_ids: modelIds,
      budget_per_month: budget === '' ? null : Number(budget),
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        create.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Keys for this project can only call the models you allow here.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Allowed models</legend>
            {models.isPending && (
              <p className="text-sm text-muted-foreground">Loading models...</p>
            )}
            {models.isError && (
              <p className="text-sm text-destructive">{models.error.message}</p>
            )}
            {models.data?.map((model) => (
              <Label key={model.id} className="font-normal">
                <Checkbox
                  checked={modelIds.includes(model.id)}
                  onCheckedChange={(checked) =>
                    toggleModel(model.id, checked === true)
                  }
                />
                {model.alias}
              </Label>
            ))}
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="project-budget">Monthly budget (USD)</Label>
            <Input
              id="project-budget"
              type="number"
              min="0"
              step="0.01"
              placeholder="No limit"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          </div>

          {create.isError && (
            <p className="text-sm text-destructive">{create.error.message}</p>
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
                create.isPending || !name.trim() || modelIds.length === 0
              }
            >
              {create.isPending ? 'Creating...' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
