import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CircleAlert,
  MessageSquarePlus,
  Send,
  Square,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router'

import {
  GatewayError,
  sendChat,
  streamChat,
  type ChatMessage,
} from '@/api/gateway'
import { queryKeys, useKeys, useModels, useProjects } from '@/api/hooks'
import type { Model } from '@/api/projects'
import { useCurrentUser } from '@/auth/useAuth'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { hasMasterPrompt } from '@/features/models/masterPrompt'
import { MasterPromptMark } from '@/features/models/MasterPromptMark'
import { ProcessedIn } from '@/features/models/ProcessedIn'
import { requestCost } from '@/lib/cost'
import { formatDate, formatMoney } from '@/lib/format'
import { ChatTranscript } from './ChatTranscript'
import {
  chatTotals,
  KEEP_CHATS,
  KEEP_DAYS,
  loadChats,
  messagesOf,
  saveChats,
  titleOf,
  type Answer,
  type Chat,
  type Turn,
} from './conversations'
import { CreateKeyDialog } from './CreateKeyDialog'
import { checkKey, KEY_PREFIX_LENGTH, type KeyCheck } from './keyModels'

type Sent = {
  // The chat the prompt belongs to; a new chat gets its id with its first
  // prompt and is stored once the first answer arrives.
  chatId: string
  model: Model
  virtualKey: string
  prompt: string
  // Every earlier turn, then the prompt.
  messages: ChatMessage[]
  stream: boolean
}

// H18IALMOND-11: the key decides the project, so the gateway refuses a model
// that project does not allow. H18IALMOND-21: the answer can stream in.
// H18IALMOND-63: the key comes first, and the model list shows only the
// models it may use. H18IALMOND-62: a chat goes on over several turns, and
// chats are kept in this browser.
export function PlaygroundPage() {
  const user = useCurrentUser()
  const queryClient = useQueryClient()
  const models = useModels()
  const keys = useKeys()
  const projects = useProjects()
  const [modelId, setModelId] = useState('')
  const [virtualKey, setVirtualKey] = useState('')
  const [prompt, setPrompt] = useState('')
  const [stream, setStream] = useState(true)
  // The answer so far while it streams in; it stays if the stream fails.
  const [liveText, setLiveText] = useState('')
  const stop = useRef<AbortController | null>(null)
  const [chats, setChats] = useState(() => loadChats(user.id))
  const [chatId, setChatId] = useState<string | null>(null)
  // false once the browser refused to store the chats.
  const [stored, setStored] = useState(true)
  const transcript = useRef<HTMLDivElement>(null)
  // null until the keys, projects and models have loaded.
  const check =
    keys.data && projects.data && models.data
      ? checkKey(virtualKey, keys.data, projects.data, models.data)
      : null
  const choices = check?.found === 'mine' ? check.models : (models.data ?? [])
  // A model the key may not use drops out instead of being sent and refused.
  const model = choices.find((candidate) => candidate.id === modelId)
  const chat = chats.find((candidate) => candidate.id === chatId) ?? null
  const turns = chat?.turns ?? []

  function storeChats(next: Chat[]) {
    setChats(next)
    setStored(saveChats(user.id, next))
  }

  // A prompt that got no answer goes back into the box, unless something new
  // was typed meanwhile.
  function giveBack(text: string) {
    setPrompt((current) => (current.trim() ? current : text))
  }

  const send = useMutation({
    mutationFn: (request: Sent) => {
      if (!request.stream) {
        return sendChat(
          request.virtualKey,
          request.model.alias,
          request.messages,
        )
      }
      const controller = new AbortController()
      stop.current = controller
      return streamChat(
        request.virtualKey,
        request.model.alias,
        request.messages,
        { onText: setLiveText, signal: controller.signal },
      )
    },
    // When the prompt was sent, kept with it in the chat.
    onMutate: () => ({ sentAt: new Date().toISOString() }),
    // Chats cannot be switched while a request runs, so `chats` is current.
    onSuccess: (reply, request, { sentAt }) => {
      if (reply.stopped && !reply.content.trim()) {
        // Stopped before any text arrived: nothing to keep.
        giveBack(request.prompt)
        return
      }
      const answeredAt = new Date().toISOString()
      const answer: Answer = {
        inputTokens: reply.inputTokens,
        outputTokens: reply.outputTokens,
        latencyMs: reply.latencyMs,
        firstTokenMs: reply.firstTokenMs,
        stopped: reply.stopped,
        requestId: reply.requestId,
        model: request.model.alias,
        streamed: request.stream,
        cost:
          reply.inputTokens === null || reply.outputTokens === null
            ? null
            : requestCost(request.model, reply.inputTokens, reply.outputTokens),
      }
      const added: Turn[] = [
        { role: 'user', content: request.prompt, at: sentAt },
        { role: 'assistant', content: reply.content, at: answeredAt, answer },
      ]
      const earlier = chats.find((candidate) => candidate.id === request.chatId)
      const updated: Chat = earlier
        ? {
            ...earlier,
            modelId: request.model.id,
            updatedAt: answeredAt,
            turns: [...earlier.turns, ...added],
          }
        : {
            id: request.chatId,
            title: titleOf(request.prompt),
            modelId: request.model.id,
            createdAt: sentAt,
            updatedAt: answeredAt,
            turns: added,
          }
      storeChats([
        updated,
        ...chats.filter((candidate) => candidate.id !== request.chatId),
      ])
    },
    onError: (_error, request) => giveBack(request.prompt),
  })
  const sent = send.variables
  const streaming = send.isPending && sent?.stream === true
  const pending =
    send.isPending && sent
      ? { prompt: sent.prompt, text: liveText, streaming }
      : null
  const totals = chatTotals(turns)
  const answers = turns.filter((turn) => turn.role === 'assistant').length

  // Keep the newest turn in view while the chat grows.
  useEffect(() => {
    const box = transcript.current
    if (box) {
      box.scrollTop = box.scrollHeight
    }
  }, [turns.length, liveText, send.isPending, chatId])

  function handleSend() {
    const text = prompt.trim()
    if (!model || !text || send.isPending) {
      return
    }
    const id = chat?.id ?? crypto.randomUUID()
    setChatId(id)
    setLiveText('')
    setPrompt('')
    send.mutate({
      chatId: id,
      model,
      virtualKey: virtualKey.trim(),
      prompt: text,
      messages: [...messagesOf(turns), { role: 'user', content: text }],
      stream,
    })
  }

  // Enter sends and Shift+Enter starts a new line. Enter while an input
  // method is still composing (Chinese, Japanese) does not send.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      handleSend()
    }
  }

  function startNewChat() {
    setChatId(null)
    setLiveText('')
    send.reset()
  }

  function openChat(id: string) {
    const opened = chats.find((candidate) => candidate.id === id)
    setChatId(id)
    if (opened?.modelId) {
      setModelId(opened.modelId)
    }
    setLiveText('')
    send.reset()
  }

  function deleteChat() {
    storeChats(chats.filter((candidate) => candidate.id !== chatId))
    startNewChat()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Playground</h1>
        <p className="text-muted-foreground">
          Chat with an AI model through the gateway and see what each answer
          costs.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Key and model</CardTitle>
          <CardDescription>
            Enter your virtual key, then pick one of the models it can use. The
            key's project pays for every message.
          </CardDescription>
          <CardAction>
            <CreateKeyDialog
              onUse={setVirtualKey}
              onCreated={() =>
                queryClient.invalidateQueries({ queryKey: queryKeys.keys })
              }
            />
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="virtual-key">Virtual API Key</Label>
            <Input
              id="virtual-key"
              type="password"
              value={virtualKey}
              onChange={(event) => setVirtualKey(event.target.value)}
              placeholder="Enter virtual API key"
              aria-describedby="key-models"
            />
            <KeyHint
              id="key-models"
              check={check}
              typed={virtualKey.trim().length >= KEY_PREFIX_LENGTH}
              checking={keys.isFetching || projects.isFetching}
              failed={keys.isError || projects.isError}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Select value={model?.id ?? ''} onValueChange={setModelId}>
              <SelectTrigger id="model" className="w-full">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {choices.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    <span className="flex items-center gap-2">
                      {option.alias}
                      <ProcessedIn model={option} />
                      <MasterPromptMark model={option} />
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {model && hasMasterPrompt(model) && (
              <p className="text-xs text-muted-foreground">
                An admin set a master prompt for this model: it goes before your
                messages and counts as input tokens.
              </p>
            )}
            {models.isError && (
              <p className="text-sm text-destructive">{models.error.message}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="stream"
              checked={stream}
              onCheckedChange={setStream}
              disabled={send.isPending}
            />
            <Label htmlFor="stream">Stream the response</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="truncate">
            {chat?.title ?? 'New chat'}
          </CardTitle>
          <CardDescription>
            Prompts and responses are stored on the platform for auditing and
            security review. Your chats are also kept in this browser for{' '}
            {KEEP_DAYS} days, the newest {KEEP_CHATS} of them; your key is not.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={chat?.id ?? ''}
              onValueChange={openChat}
              disabled={send.isPending || chats.length === 0}
            >
              <SelectTrigger
                aria-label="Recent chats"
                className="w-full sm:w-72"
              >
                <SelectValue
                  placeholder={
                    chats.length > 0
                      ? 'Open a recent chat'
                      : 'No saved chats yet'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {chats.map((saved) => (
                  <SelectItem key={saved.id} value={saved.id}>
                    <span className="flex items-center gap-2">
                      <span className="truncate">{saved.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(saved.updatedAt)}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={startNewChat}
              disabled={send.isPending || chatId === null}
            >
              <MessageSquarePlus />
              New chat
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete this chat"
                  disabled={!chat || send.isPending}
                >
                  <Trash2 />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
                  <AlertDialogDescription>
                    It is removed from this browser. The platform's request log
                    still keeps its requests.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={deleteChat}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div
            ref={transcript}
            className="max-h-[32rem] overflow-y-auto rounded-md border p-4"
          >
            <ChatTranscript turns={turns} pending={pending} />
          </div>

          {send.isError && (
            <div className="space-y-2">
              <GatewayAlert error={send.error} />
              {liveText && (
                <div className="rounded-md border border-dashed px-3 py-2 text-sm whitespace-pre-wrap text-muted-foreground">
                  {liveText}
                </div>
              )}
            </div>
          )}

          {answers > 0 && (
            <p className="text-xs text-muted-foreground">
              This chat so far: {answers} {answers === 1 ? 'answer' : 'answers'}
              , {totals.inputTokens} tokens in, {totals.outputTokens} out,{' '}
              {formatMoney(totals.cost)}. Each message sends the whole chat
              again, so long chats use more input tokens.
            </p>
          )}
          {!stored && (
            <p className="text-xs text-destructive">
              This browser could not keep the chat, so it is lost when the page
              reloads.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="prompt">Message</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write a message..."
              className="min-h-20"
              aria-describedby="prompt-help"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p id="prompt-help" className="text-xs text-muted-foreground">
                Enter sends; Shift+Enter starts a new line.
              </p>
              <div className="flex gap-2">
                {streaming && (
                  <Button
                    variant="outline"
                    onClick={() => stop.current?.abort()}
                  >
                    <Square />
                    Stop
                  </Button>
                )}
                <Button
                  onClick={handleSend}
                  disabled={
                    send.isPending ||
                    !model ||
                    !virtualKey.trim() ||
                    !prompt.trim()
                  }
                >
                  <Send />
                  {streaming
                    ? 'Streaming...'
                    : send.isPending
                      ? 'Sending...'
                      : 'Send'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" asChild>
          <Link to="/requests">Request History</Link>
        </Button>
      </div>
    </div>
  )
}

type KeyHintProps = {
  id: string
  check: KeyCheck | null
  // At least as long as a key's prefix.
  typed: boolean
  checking: boolean
  failed: boolean
}

// What the Playground knows about the key, under the key field.
function KeyHint({ id, check, typed, checking, failed }: KeyHintProps) {
  let text: string | null = null
  let warning = false
  if (check?.found === 'mine') {
    const { key, models } = check
    const project = key.project_name ?? 'its project'
    if (key.status !== 'active') {
      warning = true
      text = `This key ${key.status === 'revoked' ? 'was revoked' : 'has expired'}, so the gateway will refuse it. Create a new key.`
    } else if (models.length === 0) {
      text = `This key belongs to ${project}, which allows no models yet.`
    } else {
      text = `This key belongs to ${project} and can use ${models.length} ${models.length === 1 ? 'model' : 'models'}.`
    }
  } else if (typed && checking) {
    text = 'Checking which models this key can use...'
  } else if (typed && failed) {
    text =
      'Your keys could not be loaded, so every model is listed. The gateway still checks the key.'
  } else if (check?.found === 'not-mine') {
    text =
      'This key is not in your key list, so every model is listed. The gateway checks whether it may use the model you pick.'
  }
  return (
    <p
      id={id}
      aria-live="polite"
      className={
        warning ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'
      }
    >
      {text}
    </p>
  )
}

const errorTitles: Record<number, string> = {
  401: 'The key was not accepted',
  403: 'Not allowed',
  404: 'Not found',
  429: 'Too many requests',
}

function GatewayAlert({ error }: { error: Error }) {
  const status = error instanceof GatewayError ? error.status : null
  let title = "Couldn't reach the gateway"
  if (status !== null) {
    title =
      status >= 500
        ? 'The provider failed'
        : (errorTitles[status] ?? 'Request failed')
  }
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {status === null ? error.message : `${status}: ${error.message}`}
      </AlertDescription>
    </Alert>
  )
}
