import { useQuery } from '@tanstack/react-query'
import { getKeys } from './keys'
import { getModels, getProjects } from './projects'
import { getRequests } from './requests'
import { getStats } from './stats'
import { getTeamMembers, getTeams, getTeamUsage, type Team } from './teams'

// Invalidate a key after changing what it lists, so every page refreshes.
export const queryKeys = {
  teams: ['teams'],
  members: (teamId: string) => ['members', teamId],
  allProjects: ['projects'],
  projects: (teamId?: string) => ['projects', teamId ?? 'all'],
  models: ['models'],
  keys: ['keys'],
  requests: ['requests'],
  stats: (resourceId: string, start?: number, end?: number) => [
    'stats',
    resourceId,
    start,
    end,
  ],
  teamUsage: (teamIds: string[]) => ['team-usage', ...teamIds],
}

export function useTeams() {
  return useQuery({ queryKey: queryKeys.teams, queryFn: getTeams })
}

export function useTeamMembers(teamId: string) {
  return useQuery({
    queryKey: queryKeys.members(teamId),
    queryFn: () => getTeamMembers(teamId),
  })
}

export function useProjects(teamId?: string) {
  return useQuery({
    queryKey: queryKeys.projects(teamId),
    queryFn: () => getProjects(teamId),
  })
}

export function useModels() {
  return useQuery({ queryKey: queryKeys.models, queryFn: getModels })
}

export function useKeys() {
  return useQuery({ queryKey: queryKeys.keys, queryFn: getKeys })
}

export function useRequests() {
  return useQuery({ queryKey: queryKeys.requests, queryFn: getRequests })
}

export function useStats(
  resourceId: string | undefined,
  start?: number,
  end?: number,
) {
  return useQuery({
    queryKey: queryKeys.stats(resourceId ?? '', start, end),
    queryFn: () => getStats(resourceId!, start, end),
    enabled: resourceId !== undefined,
  })
}

// Waits for the team list; pass no teams to skip it, as for plain users.
export function useTeamUsage(
  teams: Team[] | undefined,
  userId: string,
  isAdmin: boolean,
) {
  return useQuery({
    queryKey: queryKeys.teamUsage(teams?.map((team) => team.id) ?? []),
    queryFn: () => getTeamUsage(teams ?? [], userId, isAdmin),
    enabled: teams !== undefined,
  })
}