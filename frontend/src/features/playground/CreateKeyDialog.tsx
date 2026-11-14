import { useMutation } from '@tanstack/react-query'
import { Copy, FolderPlus, KeyRound, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { useModels, useProjects, useTeams } from '@/api/hooks'
import { createKey } from '@/api/keys'
import { isChatModel } from '@/api/projects'
import type { Team } from '@/api/teams'
import { useCurrentUser } from '@/auth/useAuth'
import { ErrorState } from '@/components/layout/ErrorState'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KeySnippet } from '@/features/keys/KeySnippet'
import { OneTimeKeyNotice } from '@/features/keys/OneTimeKeyNotice'
import { MasterPromptMark } from '@/features/models/MasterPromptMark'
import { ProcessedIn } from '@/features/models/ProcessedIn'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

type CreateKeyDialogProps = {
  onUse?: (key: string) => void
  onCreated?: () => void
  // The trigger as the main button where creating a key is the next step.
  primary?: boolean
}

// A key belongs to one project and to the person who creates it: the team
// lead, or a member allowed to create keys. The raw key is shown only here.
export function CreateKeyDialog({
  onUse,
  onCreated,
  primary = false,
}: CreateKeyDialogProps) {
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [modelIds, setModelIds] = useState<string[]>([])
  const projects = useProjects()
  const teams = useTeams()
  const models = useModels()
  const teamNames = new Map(teams.data?.map((team) => [team.id, team.name]))
  // Without a team, or a project in one, there is nothing to choose: the
  // dialog says why instead of opening an empty list.
  const missing =
    teams.data?.length === 0
      ? 'team'
      : projects.data?.length === 0
        ? 'project'
        : undefined
  const chosenProject = projects.data?.find(
    (project) => project.id === projectId,
  )
  const projectModels = models.data?.filter((model) =>
    chosenProject?.model_ids.includes(model.id),
  )
  const create = useMutation({
    mutationFn: createKey,
    onSuccess: () => onCreated?.(),
  })
  const created = create.data
  // The code example chats with the first chat model the key allows.
  const exampleModel =
    projectModels?.find(
      (model) =>
        isChatModel(model) &&
        (modelIds.length === 0 || modelIds.includes(model.id)),
    )?.alias ?? 'MODEL_NAME'

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      // Closing forgets the key, so it is shown once.
      create.reset()
      changeProject('')
    }
  }

  // Another project allows different models, so the choice starts again, and
  // the last project's error no longer applies.
  function changeProject(id: string) {
    setProjectId(id)
    setModelIds([])
    create.reset()
  }

  function toggleModel(id: string, checked: boolean) {
    setModelIds((ids) =>
      checked ? [...ids, id] : ids.filter((other) => other !== id),
    )
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
        <Button size="sm" variant={primary ? 'default' : 'outline'}>
          <KeyRound />
          Create key
        </Button>
      </DialogTrigger>

      <DialogContent
        // Wider while the key is on screen, for the code example. Taller than
        // a short screen (720p, a phone), it scrolls, as the model dialogs do,
        // so its title and buttons stay reachable.
        className={cn(
          'max-h-[calc(100dvh-2rem)] overflow-y-auto',
          created && 'sm:max-w-xl',
        )}
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
              ? "Use it with the gateway's OpenAI-compatible API."
              : 'Calls made with the key count against its project.'}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="min-w-0 space-y-4">
            <OneTimeKeyNotice />
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

            <section className="space-y-2 border-t pt-4">
              <h3 className="text-sm font-medium">Use this key in your code</h3>
              <KeySnippet apiKey={created.key} model={exampleModel} />
            </section>
          </div>
        ) : missing ? (
          <MissingProject missing={missing} teams={teams.data ?? []} />
        ) : (
          <div className="space-y-2">
            <Label htmlFor="key-project">Project</Label>
            <Select value={projectId} onValueChange={changeProject}>
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
            {/* An admin sees every project but, like anyone, can only create
                keys where the backend's can_create_key allows it. */}
            <p className="text-xs text-muted-foreground">
              You can create keys only in teams you lead, or where your team
              lead allows it.
            </p>

            {projects.isError && (
              <ErrorState
                title="Couldn't load your projects"
                error={projects.error}
              />
            )}

            {chosenProject && (
              <fieldset className="space-y-2 pt-2">
                <legend className="text-sm font-medium">Allowed models</legend>
                <p className="text-xs text-muted-foreground">
                  Leave all unticked to allow every model in this project.
                </p>
                {models.isError && (
                  <p className="text-sm text-destructive">
                    {models.error.message}
                  </p>
                )}
                {projectModels?.map((model) => (
                  <Label key={model.id} className="font-normal">
                    <Checkbox
                      checked={modelIds.includes(model.id)}
                      onCheckedChange={(checked) =>
                        toggleModel(model.id, checked === true)
                      }
                    />
                    {model.alias}
                    <ProcessedIn model={model} />
                    <MasterPromptMark model={model} />
                  </Label>
                ))}
              </fieldset>
            )}

            {create.isError && (
              <p className="text-sm text-destructive">
                {create.error instanceof ApiError && create.error.status === 403
                  ? "You can't create keys in this project. Ask its team lead for permission."
                  : create.error.message}
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
          ) : missing ? (
            <Button type="button" onClick={() => changeOpen(false)}>
              Close
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
                onClick={() =>
                  create.mutate({
                    project_id: projectId,
                    model_ids: modelIds.length > 0 ? modelIds : undefined,
                  })
                }
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

// Why there is no project to choose, and who can change it: a plain user
// asks a team lead; a team lead or an admin makes the team or the project.
function MissingProject({
  missing,
  teams,
}: {
  missing: 'team' | 'project'
  teams: Team[]
}) {
  const user = useCurrentUser()
  const canCreate = user.role !== 'user'
  const teamsPage = <Link to="/teams">Teams & projects</Link>

  const title =
    missing === 'team'
      ? "You're not in a team yet"
      : teams.length === 1 && !canCreate
        ? `${teams[0].name} has no projects yet`
        : 'No projects yet'

  return (
    <Alert
      role="status"
      className="border-amber-300 bg-amber-50 text-amber-900 [&>svg]:text-amber-600"
    >
      {missing === 'team' ? <UserPlus /> : <FolderPlus />}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="text-amber-900/80">
        {missing === 'team' && !canCreate && (
          <>
            Keys belong to a team's project. Ask a team lead to add you: they
            need your email,{' '}
            <span className="wrap-break-word">{user.email}</span>.
          </>
        )}
        {missing === 'team' && canCreate && (
          <>
            Keys belong to a team's project. Create both on {teamsPage} first.
          </>
        )}
        {missing === 'project' && !canCreate && (
          <>
            Keys belong to a project. Ask your team lead to create one; it then
            appears here.
          </>
        )}
        {missing === 'project' && canCreate && (
          <>Keys belong to a project. Create one on {teamsPage} first.</>
        )}
      </AlertDescription>
    </Alert>
  )
}
