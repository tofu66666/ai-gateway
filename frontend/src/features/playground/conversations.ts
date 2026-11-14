import type { ChatMessage, ChatReply } from '@/api/gateway'

// H18IALMOND-62: the Playground keeps each person's chats in this browser, for
// 30 days and at most 20 of them (Meeting #20: front end only, and small).
// The virtual key is never stored.
export const KEEP_DAYS = 30
export const KEEP_CHATS = 20
const DAY_MS = 86_400_000

// An answer as it arrived, priced then, so a later price change does not
// change what the chat shows.
export type Answer = Omit<ChatReply, 'content'> & {
  model: string
  streamed: boolean
  // USD; null when the provider reported no token counts.
  cost: number | null
}

export type Turn =
  | { role: 'user'; content: string; at: string }
  | { role: 'assistant'; content: string; at: string; answer: Answer }

export type Chat = {
  id: string
  title: string
  // The model picked last, picked again when the chat is reopened.
  modelId: string | null
  createdAt: string
  updatedAt: string
  turns: Turn[]
}

const storageKey = (userId: string) => `p127.playground.${userId}`

// Newest first, none left untouched for 30 days, at most 20.
export function keepChats(chats: Chat[], now = Date.now()): Chat[] {
  const oldest = now - KEEP_DAYS * DAY_MS
  return chats
    .filter((chat) => Date.parse(chat.updatedAt) >= oldest)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, KEEP_CHATS)
}

export function loadChats(userId: string): Chat[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    const stored: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(stored)) {
      return []
    }
    const kept = keepChats(stored.filter(isChat))
    if (kept.length < stored.length) {
      // Drop old chats from the browser too, not only from the list.
      saveChats(userId, kept)
    }
    return kept
  } catch {
    // Unreadable or blocked storage: start with no chats.
    return []
  }
}

// false when the browser refuses, as when its storage is full or blocked:
// the chats then last until the page reloads.
export function saveChats(userId: string, chats: Chat[]): boolean {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(keepChats(chats)))
    return true
  } catch {
    return false
  }
}

// What the gateway gets: every turn so far. Empty turns are left out, as
// providers refuse empty messages.
export function messagesOf(turns: Turn[]): ChatMessage[] {
  return turns
    .filter((turn) => turn.content.trim() !== '')
    .map((turn) => ({ role: turn.role, content: turn.content }))
}

// The first line of the first prompt, cut to fit the list of chats.
export function titleOf(prompt: string) {
  const line = prompt.trim().split('\n')[0]
  return line.length > 60 ? `${line.slice(0, 57)}...` : line
}

// Tokens and cost of every answer so far; a resent conversation counts its
// earlier messages again as input.
export function chatTotals(turns: Turn[]) {
  let inputTokens = 0
  let outputTokens = 0
  let cost = 0
  for (const turn of turns) {
    if (turn.role === 'assistant') {
      inputTokens += turn.answer.inputTokens ?? 0
      outputTokens += turn.answer.outputTokens ?? 0
      cost += turn.answer.cost ?? 0
    }
  }
  return { inputTokens, outputTokens, cost }
}

function isChat(value: unknown): value is Chat {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const chat = value as Partial<Chat>
  return (
    typeof chat.id === 'string' &&
    typeof chat.updatedAt === 'string' &&
    Array.isArray(chat.turns)
  )
}
