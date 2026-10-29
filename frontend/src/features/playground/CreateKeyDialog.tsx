import { useMutation } from '@tanstack/react-query'
import { Copy, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useProjects, useTeams } from '@/api/hooks'
import { createKey } from '@/api/keys'
import { ErrorState } from '@/components/layout/ErrorState'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDate } from '@/lib/format'

type CreateKeyDialogProps = {
  onUse?: (key: string) => void
  onCreated?: () => void
}

// A key belongs to one project and to the person who creates it: the team
// lead, or a member allowed to create keys. The raw key is shown only here.
export function CreateKeyDialog({
  onUse,
  onCreated,
}: CreateKeyDialogProps) {
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const projects = useProjects()
  const teams = useTeams()
  const teamNames = new Map(teams.data?.map((team) => [team.id, team.name]))
  const create = useMutation({
    mutationFn: createKey,
    onSuccess: () => onCreated?.(),
  })
  const created = create.data

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      // Closing forgets the key, so it is shown once.
      create.reset()
      setProjectId('')
    }
  }

  function copy(key: string) {
    navigator.clipboard
      .writeText(key)
      .then(() => toast.success('Key copied'))
      .catch(() => toast.error("Couldn't copy. Select the key and copy it."))
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <KeyRound />
          Create key
        </Button>
      </DialogTrigger>

      <DialogContent
        // While the key is on screen, only the buttons close the dialog.
        onInteractOutside={(event) => {
          if (created) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (created) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{created ? 'Your new key' : 'Create key'}</DialogTitle>
          <DialogDescription>
            {created
              ? 'Copy it now: it is shown only once.'
              : 'Calls made with the key count against its project.'}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                readOnly
                aria-label="New key"
                value={created.key}
                className="font-mono text-xs"
                onFocus={(event) => event.target.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copy key"
                onClick={() => copy(created.key)}
              >
                <Copy />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              Expires {formatDate(created.expires_at)}.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="key-project">Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="key-project" className="w-full">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>

              <SelectContent>
                {projects.data?.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {teamNames.get(project.team_id) ?? 'Team'} / {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {projects.isError && (
              <ErrorState
                title="Couldn't load your projects"
                error={projects.error}
              />
            )}

            {create.isError && (
              <p className="text-sm text-destructive">
                {create.error.message}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {created ? (
            <Button
              type="button"
              onClick={() => {
                onUse?.(created.key)
                changeOpen(false)
              }}
            >
              {onUse ? 'Use this key' : 'Done'}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => changeOpen(false)}
              >
                Cancel
              </Button>

              <Button
                type="button"
                disabled={!projectId || create.isPending}
                onClick={() => create.mutate(projectId)}
              >
                {create.isPending ? 'Creating...' : 'Create key'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}