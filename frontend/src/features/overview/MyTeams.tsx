import {
  Copy,
  FolderPlus,
  KeyRound,
  Rocket,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useKeys } from '@/api/hooks'
import { useCurrentUser } from '@/auth/useAuth'
import { EmptyState } from '@/components/layout/EmptyState'
import { ErrorState } from '@/components/layout/ErrorState'
import { SkeletonLines } from '@/components/layout/Placeholders'
import { StatusBadge } from '@/components/layout/StatusBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CreateKeyDialog } from '@/features/playground/CreateKeyDialog'
import {
  standingOf,
  useMyTeams,
  type MyTeam,
} from '@/features/teams/useMyTeams'

// A plain user has no Teams & projects page, so their Overview lists their
// teams and projects and says what to do next: join a team, wait for a
// project, get permission to create keys, or create a key and try a model.
export function MyTeams({ nothingSent }: { nothingSent: boolean }) {
  const user = useCurrentUser()
  const myTeams = useMyTeams(user.id)

  // Outside every team there is nothing else to show, so the next step
  // takes the whole card.
  if (myTeams.data?.length === 0) {
    return (
      <EmptyState
        icon={UserPlus}
        title="You're not in a team yet"
        action={<CopyEmail email={user.email} />}
      >
        A team lead adds people to a team by email. Send yours to your team
        lead: <Strong>{user.email}</Strong>. Your teams and their projects then
        appear here.
      </EmptyState>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your teams</CardTitle>
        <CardDescription>
          The teams you belong to and their projects. Team leads manage them.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {myTeams.error ? (
          <ErrorState title="Couldn't load your teams" error={myTeams.error} />
        ) : !myTeams.data ? (
          <SkeletonLines rows={2} />
        ) : (
          <>
            <NextStep myTeams={myTeams.data} nothingSent={nothingSent} />
            <TeamList myTeams={myTeams.data} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function NextStep({
  myTeams,
  nothingSent,
}: {
  myTeams: MyTeam[]
  nothingSent: boolean
}) {
  const user = useCurrentUser()
  const keys = useKeys()
  const standing = standingOf(myTeams)
  const withProjects = myTeams.filter((entry) => entry.projects.length > 0)

  if (standing === 'no-project') {
    return (
      <Notice
        warning
        icon={FolderPlus}
        title={
          myTeams.length === 1
            ? `${myTeams[0].team.name} has no projects yet`
            : 'Your teams have no projects yet'
        }
      >
        Keys belong to a project, so you can't create one yet. Ask{' '}
        {askWho(myTeams)} to create a project.
      </Notice>
    )
  }

  if (standing === 'no-permission') {
    return (
      <Notice warning icon={KeyRound} title="You can't create keys yet">
        Your team lead decides who may create keys. Ask {askWho(withProjects)}{' '}
        to allow it for you.
      </Notice>
    )
  }

  const ownKeys = keys.data?.filter((key) => key.user_id === user.id)
  const hasKey = ownKeys?.some((key) => key.status === 'active')

  if (ownKeys && !hasKey) {
    return (
      <Notice
        icon={Rocket}
        title={
          ownKeys.length === 0
            ? 'Create your first key'
            : 'You have no active key'
        }
        action={
          <>
            <CreateKeyDialog primary />
            <Button asChild size="sm" variant="outline">
              <Link to="/playground">Open the Playground</Link>
            </Button>
          </>
        }
      >
        {ownKeys.length === 0
          ? 'Choose one of these projects for it, then try a model in the Playground.'
          : 'Your keys were revoked or have expired. Create a new one to call a model again.'}
      </Notice>
    )
  }

  if (hasKey && nothingSent) {
    return (
      <Notice
        icon={Rocket}
        title="Nothing sent in this period"
        action={
          <Button asChild size="sm">
            <Link to="/playground">Open the Playground</Link>
          </Button>
        }
      >
        Try a model in the Playground with one of your keys.
      </Notice>
    )
  }

  return null
}

// One row per team: its lead, its projects and whether you may create keys.
function TeamList({ myTeams }: { myTeams: MyTeam[] }) {
  return (
    <ul className="divide-y rounded-md border">
      {myTeams.map(({ team, projects, me, lead }) => (
        <li
          key={team.id}
          className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-3 py-2.5"
        >
          <div className="min-w-0 space-y-1.5">
            <div>
              <p className="font-medium">{team.name}</p>
              {lead && (
                <p className="text-xs wrap-break-word text-muted-foreground">
                  Team lead: {lead.email}
                </p>
              )}
            </div>
            {projects.length > 0 ? (
              <ul
                aria-label={`Projects in ${team.name}`}
                className="flex flex-wrap gap-1.5"
              >
                {projects.map((project) => (
                  <li key={project.id}>
                    <Badge variant="outline">{project.name}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No projects yet</p>
            )}
          </div>
          {/* Key permission matters only once the team has a project. */}
          {me &&
            projects.length > 0 &&
            (me.is_owner ? (
              <StatusBadge tone="neutral">Team lead</StatusBadge>
            ) : me.can_create_key ? (
              <StatusBadge tone="success">Can create keys</StatusBadge>
            ) : (
              <StatusBadge tone="warning">Can't create keys</StatusBadge>
            ))}
        </li>
      ))}
    </ul>
  )
}

// Names the person to ask: the one team lead, or any of several.
function askWho(myTeams: MyTeam[]) {
  const leads = [
    ...new Set(myTeams.flatMap((entry) => entry.lead?.email ?? [])),
  ]
  if (leads.length === 1) {
    return (
      <>
        your team lead, <Strong>{leads[0]}</Strong>,
      </>
    )
  }
  return leads.length > 1 ? 'one of your team leads' : 'your team lead'
}

function Strong({ children }: { children: ReactNode }) {
  return (
    <span className="font-medium wrap-break-word text-foreground">
      {children}
    </span>
  )
}

function CopyEmail({ email }: { email: string }) {
  function copy() {
    navigator.clipboard
      .writeText(email)
      .then(() => toast.success('Email copied'))
      .catch(() => toast.error("Couldn't copy. Select the email and copy it."))
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={copy}>
      <Copy />
      Copy my email
    </Button>
  )
}

// The next step, in the card: amber when someone else has to act first.
function Notice({
  icon: Icon,
  title,
  warning = false,
  action,
  children,
}: {
  icon: LucideIcon
  title: string
  warning?: boolean
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Alert
      role="status"
      className={
        warning
          ? 'border-amber-300 bg-amber-50 text-amber-900 [&>svg]:text-amber-600'
          : undefined
      }
    >
      <Icon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className={warning ? 'text-amber-900/80' : undefined}>
        {children}
      </AlertDescription>
      {/* Beside the description, not in it, so the buttons keep their own
          text style rather than the description's underlined links. */}
      {action && (
        <div className="col-start-2 mt-3 flex flex-wrap gap-2">{action}</div>
      )}
    </Alert>
  )
}
