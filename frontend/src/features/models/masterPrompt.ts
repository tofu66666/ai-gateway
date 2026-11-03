import type { Model } from '@/api/projects'

// H18IALMOND-56: the longest master prompt the backend takes (H18IALMOND-57).
export const MAX_PROMPT_LENGTH = 2000

// Admins get the text; team leads and users only get has_prompt.
export function hasMasterPrompt(model: Model) {
  return model.has_prompt ?? Boolean(model.prompt)
}
