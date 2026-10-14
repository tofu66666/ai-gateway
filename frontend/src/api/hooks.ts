import { useQuery } from '@tanstack/react-query'
import { getModels, getProjects } from './projects'
import { getTeamMembers, getTeams } from './teams'

// Invalidate a key after changing what it lists, so every page refreshes.
export const queryKeys = {
  teams: ['teams'],
  members: (teamId: string) => ['members', teamId],
  allProjects: ['projects'],
  projects: (teamId?: string) => ['projects', teamId ?? 'all'],
  models: ['models'],
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
