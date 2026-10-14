import { useQuery } from '@tanstack/react-query'
import { getModels, getProjects } from './projects'
import { getRequests } from './requests'
import { getTeamMembers, getTeams, getTeamUsage, type Team } from './teams'

// Invalidate a key after changing what it lists, so every page refreshes.
export const queryKeys = {
  teams: ['teams'],
  members: (teamId: string) => ['members', teamId],
  allProjects: ['projects'],
  projects: (teamId?: string) => ['projects', teamId ?? 'all'],
  models: ['models'],
  requests: ['requests'],
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

export function useRequests() {
  return useQuery({ queryKey: queryKeys.requests, queryFn: getRequests })
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
