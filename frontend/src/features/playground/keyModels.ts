import type { VirtualKey } from '@/api/keys'
import type { Model, Project } from '@/api/projects'

// GET /api_keys shows each key by its first 12 characters
// (DISPLAY_PREFIX_LENGTH in backend/app/routers/virtual_key.py).
export const KEY_PREFIX_LENGTH = 12

export type KeyCheck =
  // Too short to be a key yet.
  | { found: 'nothing' }
  // Not among the keys the caller can list.
  | { found: 'not-mine' }
  | { found: 'mine'; key: VirtualKey; models: Model[] }

// H18IALMOND-63: the Playground matches a pasted key to the caller's keys by
// its prefix, so the model list shows only what the gateway will accept. A key
// without its own model list may use every model of its project.
export function checkKey(
  pasted: string,
  keys: VirtualKey[],
  projects: Project[],
  models: Model[],
): KeyCheck {
  const raw = pasted.trim()
  if (raw.length < KEY_PREFIX_LENGTH) {
    return { found: 'nothing' }
  }
  const prefix = raw.slice(0, KEY_PREFIX_LENGTH)
  const same = keys.filter((key) => key.prefix === prefix)
  // Prefixes are random, but prefer an active key if two ever match.
  const key = same.find((candidate) => candidate.status === 'active') ?? same[0]
  if (!key) {
    return { found: 'not-mine' }
  }
  const project = projects.find((candidate) => candidate.id === key.project_id)
  const projectModels = project
    ? models.filter((model) => project.model_ids.includes(model.id))
    : models
  // allowed_models holds aliases; the gateway checks the key's list against
  // the project's, so both must allow the model.
  const keyModels =
    key.allowed_models.length > 0
      ? projectModels.filter((model) =>
          key.allowed_models.includes(model.alias),
        )
      : projectModels
  return { found: 'mine', key, models: keyModels }
}
