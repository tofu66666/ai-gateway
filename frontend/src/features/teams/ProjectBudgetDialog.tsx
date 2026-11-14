
import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys, useModels } from '@/api/hooks'
import {
  updateProjectBudget,
  type Project,
} from '@/api/projects'
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

type Field = 'budget' | 'models'

function getErrorField(message: string): Field | null {
  const text = message.toLowerCase()

  if (text.includes('model')) return 'models'
  if (text.includes('budget')) return 'budget'

  return null
}

export function ProjectBudgetDialog({
  project,
}: {
  project: Project
}) {
  const [open, setOpen] = useState(false)

  const [budget, setBudget] = useState(
    project.budget_per_month === null
      ? ''
      : String(project.budget_per_month),
  )

  const [selectedModels, setSelectedModels] = useState<string[]>(
    project.model_ids,
  )

  const [validationError, setValidationError] = useState<
    { field: Field; message: string } | null
  >(null)

  const models = useModels()
  const queryClient = useQueryClient()

  const update = useMutation({
    mutationFn: (values: {
      budget_per_month: number | null
      model_ids: string[]
    }) => updateProjectBudget(project.id, values),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.allProjects,
      })

      toast.success('Project settings updated')
      setOpen(false)
    },
  })

  function resetForm() {
    setBudget(
      project.budget_per_month === null
        ? ''
        : String(project.budget_per_month),
    )

    setSelectedModels([...project.model_ids])
    setValidationError(null)
    update.reset()
  }

  function toggleModel(modelId: string, checked: boolean) {
    setSelectedModels((current) =>
      checked
        ? [...current.filter((id) => id !== modelId), modelId]
        : current.filter((id) => id !== modelId),
    )

    setValidationError(null)
    update.reset()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const value =
      budget.trim() === '' ? null : Number(budget)

    if (
      value !== null &&
      (!Number.isFinite(value) || value < 0)
    ) {
      setValidationError({
        field: 'budget',
        message: 'Enter a valid budget of 0 or more.',
      })
      return
    }

    if (selectedModels.length === 0) {
      setValidationError({
        field: 'models',
        message: 'Select at least one allowed model.',
      })
      return
    }

    setValidationError(null)

    update.mutate({
      budget_per_month: value,
      model_ids: selectedModels,
    })
  }

  const apiError = update.isError
    ? update.error.message
    : null

  const apiErrorField = apiError
    ? getErrorField(apiError)
    : null

  const budgetError =
    validationError?.field === 'budget'
      ? validationError.message
      : apiErrorField === 'budget'
        ? apiError
        : null

  const modelsError =
    validationError?.field === 'models'
      ? validationError.message
      : apiErrorField === 'models'
        ? apiError
        : null

  const generalError =
    apiError && apiErrorField === null
      ? apiError
      : null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)

        if (next) {
          resetForm()
        } else {
          setValidationError(null)
          update.reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Edit settings for ${project.name}`}
        >
          Edit settings
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          <DialogHeader>
            <DialogTitle>
              Edit project settings
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
              aria-invalid={Boolean(budgetError)}
              aria-describedby={
                budgetError
                  ? `budget-error-${project.id}`
                  : undefined
              }
              onChange={(event) => {
                setBudget(event.target.value)
                setValidationError(null)
                update.reset()
              }}
            />

            <p className="text-xs text-muted-foreground">
              Leave blank for no monthly limit.
            </p>

            {budgetError && (
              <p
                id={`budget-error-${project.id}`}
                role="alert"
                className="text-sm text-destructive"
              >
                {budgetError}
              </p>
            )}
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">
              Allowed models
            </legend>

            <p className="text-xs text-muted-foreground">
              Select the models this project can use.
              At least one model is required.
            </p>

            {models.isPending && (
              <p className="text-sm text-muted-foreground">
                Loading models...
              </p>
            )}

            {models.isError && (
              <p
                role="alert"
                className="text-sm text-destructive"
              >
                Could not load models: {models.error.message}
              </p>
            )}

            {models.data && models.data.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No models are available.
              </p>
            )}

            {models.data && models.data.length > 0 && (
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                {models.data.map((model) => (
                  <label
                    key={model.id}
                    className="flex cursor-pointer items-center gap-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={selectedModels.includes(model.id)}
                      disabled={update.isPending}
                      onChange={(event) =>
                        toggleModel(
                          model.id,
                          event.target.checked,
                        )
                      }
                    />

                    <span>{model.alias}</span>
                  </label>
                ))}
              </div>
            )}

            {modelsError && (
              <p
                role="alert"
                className="text-sm text-destructive"
              >
                {modelsError}
              </p>
            )}
          </fieldset>

          {generalError && (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {generalError}
            </p>
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
                update.isPending ||
                models.isPending ||
                models.isError ||
                !models.data?.length
              }
            >
              {update.isPending
                ? 'Saving...'
                : 'Save settings'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
