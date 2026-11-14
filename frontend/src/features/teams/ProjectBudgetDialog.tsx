
import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys } from '@/api/hooks'
import { updateProjectBudget, type Project } from '@/api/projects'
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

export function ProjectBudgetDialog({ project }: { project: Project }) {
  const [open, setOpen] = useState(false)
  const [budget, setBudget] = useState(
    project.budget_per_month === null
      ? ''
      : String(project.budget_per_month),
  )

  const queryClient = useQueryClient()

  const update = useMutation({
    mutationFn: (value: number | null) =>
      updateProjectBudget(project.id, {
        budget_per_month: value,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.allProjects,
      })
      toast.success('Project budget updated')
      setOpen(false)
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const value = budget.trim() === ''
      ? null
      : Number(budget)

    if (
      value !== null &&
      (!Number.isFinite(value) || value < 0)
    ) {
      return
    }

    update.mutate(value)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)

        if (next) {
          setBudget(
            project.budget_per_month === null
              ? ''
              : String(project.budget_per_month),
          )
        }

        update.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Edit budget for ${project.name}`}
        >
          Edit budget
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>
              Edit project budget
            </DialogTitle>
            <DialogDescription>
              {project.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={`budget-${project.id}`}>
              Monthly budget (USD)
            </Label>

            <Input
              id={`budget-${project.id}`}
              type="number"
              min="0"
              step="any"
              placeholder="No limit"
              value={budget}
              aria-invalid={update.isError}
              aria-describedby={
                update.isError
                  ? `budget-error-${project.id}`
                  : undefined
              }
              onChange={(event) => {
                setBudget(event.target.value)
                update.reset()
              }}
            />

            <p className="text-xs text-muted-foreground">
              Leave blank for no monthly limit.
            </p>

            {update.isError && (
              <p
                id={`budget-error-${project.id}`}
                role="alert"
                className="text-sm text-destructive"
              >
                {update.error.message}
              </p>
            )}
          </div>

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
              disabled={update.isPending}
            >
              {update.isPending
                ? 'Saving...'
                : 'Save budget'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
