import { apiFetch } from './client'

export type AuditAction =
  | 'create_api_key'
  | 'revoke_api_key'
  | 'rotate_api_key'
  | 'team_add_user'
  | 'team_remove_user'
  | 'team_modify_owner'
  | 'team_create'
  | 'team_modify'
  | 'model_create'
  | 'model_modify'
  | 'project_create'
  | 'project_modify'

export type AuditLog = {
  id: string
  user_id: string
  user_email: string | null
  action: AuditAction
  target_id: string | null
  details: unknown
  created_at: string
}

export type AuditLogFilters = {
  action?: AuditAction
  user_email?: string
  start?: number
  end?: number
}

export function getAuditActions() {
  return apiFetch<AuditAction[]>('/audit_actions')
}

export function getAuditLogs(filters: AuditLogFilters = {}) {
  return apiFetch<AuditLog[]>('/audit_logs', {
    body: filters,
  })
}