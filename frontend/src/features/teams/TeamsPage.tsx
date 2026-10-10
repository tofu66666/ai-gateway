import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'

import { getTeams } from '@/api/teams'
import type { Team } from '@/api/teams'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadTeams() {
      try {
        const result = await getTeams()
        setTeams(result)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load teams',
        )
      } finally {
        setLoading(false)
      }
    }

    loadTeams()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Teams & Projects</h1>
        <p className="text-muted-foreground">
          Manage your teams and projects.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Teams</CardTitle>
          <CardDescription>
            Teams you currently belong to.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loading && (
            <p className="text-muted-foreground">Loading teams...</p>
          )}

          {!loading && error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {!loading && !error && teams.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Users className="size-8 text-muted-foreground" />
              <p className="font-medium">No teams yet</p>
              <p className="text-sm text-muted-foreground">
                You are not currently in any teams.
              </p>
            </div>
          )}

          {!loading && !error && teams.length > 0 && (
            <div className="space-y-3">
              {teams.map((team) => (
                <Card key={team.id} size="sm">
                  <CardHeader>
                    <CardTitle>{team.name}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}