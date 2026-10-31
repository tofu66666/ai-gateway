import { apiFetch } from './client'

export type CreatedKey = {
  id: string
  // The raw key is returned only once; the platform stores only its hash.
  key: string
  prefix: string
  project_id: string
  expires_at: string
  created_at: string
}

export type VirtualKeyStatus = 'active' | 'revoked' | 'expired'

export type VirtualKey = {
  id: string
  prefix: string
  name: string | null
  project_id: string
  project_name: string | null
  team_id: string | null
  user_id: string
  user_email: string | null
  allowed_models: string[]
  created_at: string
  expires_at: string
  revoked_at: string | null
  status: VirtualKeyStatus
}

export type RevokedKey = {
  id: string
  status: 'revoked'
  revoked_at: string
}

export type NewKey = {
  project_id: string
  // Leave out to allow every model the project allows.
  model_ids?: string[]
}

// The key expires after the database default (30 days).
export function createKey(key: NewKey) {
  return apiFetch<CreatedKey>('/create_api_key', {
    method: 'POST',
    body: key,
  })
}

export function getKeys() {
  return apiFetch<VirtualKey[]>('/api_keys')
}

export function revokeKey(keyId: string) {
  return apiFetch<RevokedKey>('/revoke_api_key', {
    method: 'POST',
    body: { key_id: keyId },
  })
}

export function rotateKey(keyId: string) {
  return apiFetch<CreatedKey>('/rotate_api_key', {
    method: 'POST',
    body: { key_id: keyId },
  })
}