import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, Send, Square } from 'lucide-react'
import { Link } from 'react-router'

import { GatewayError, sendChat, streamChat } from '@/api/gateway'
import { queryKeys, useKeys, useModels, useProjects } from '@/api/hooks'
import type { Model } from '@/api/projects'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { formatMoney } from '@/lib/format'
import { CreateKeyDialog } from './CreateKeyDialog'
import { checkKey, KEY_PREFIX_LENGTH, type KeyCheck } from './keyModels'

type Sent = {
  model: Model
  virtualKey: string
  prompt: string
  stream: boolean
}

// H18IALMOND-11: the key decides the project, so the gateway refuses a model
// that project does not allow. H18IALMOND-21: the answer can stream in.
// H18IALMOND-63: the key comes first, and the model list shows only the
// models it may use.
export function PlaygroundPage() {
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
  // null until the keys, projects and models have loaded.
  const check =
    keys.data && projects.data && models.data
      ? checkKey(virtualKey, keys.data, projects.data, models.data)
      : null
  const choices = check?.found === 'mine' ? check.models : (models.data ?? [])
  // A model the key may not use drops out instead of being sent and refused.
  const model = choices.find((candidate) => candidate.id === modelId)

  const send = useMutation({
    mutationFn: (request: Sent) => {
      if (!request.stream) {
        return sendChat(request.virtualKey, request.model.alias, request.prompt)
      }
      const controller = new AbortController()
      stop.current = controller
      return streamChat(
        request.virtualKey,
        request.model.alias,
        request.prompt,
        { onText: setLiveText, signal: controller.signal },
      )
    },
  })
  const sent = send.variables
  const reply = send.data
  const streaming = send.isPending && sent?.stream === true
  const text = reply ? reply.content : liveText

  function handleSend() {
    if (model) {
      setLiveText('')
      send.mutate({ model, virtualKey: virtualKey.trim(), prompt, stream })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Playground</h1>
        <p className="text-muted-foreground">
          Send a request to an AI model and view its response.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Request</CardTitle>
          <CardDescription>
            Enter your virtual key, then pick one of the models it can use and
            write a prompt. The key's project pays for the call.
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
                prompt and counts as input tokens.
              </p>
            )}
            {models.isError && (
              <p className="text-sm text-destructive">{models.error.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Prompt</Label>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Enter your prompt..."
              className="min-h-32"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="stream"
                checked={stream}
                onCheckedChange={setStream}
                disabled={send.isPending}
              />
              <Label htmlFor="stream">Stream the response</Label>
            </div>
            <div className="flex gap-2">
              {streaming && (
                <Button variant="outline" onClick={() => stop.current?.abort()}>
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
                    : 'Send Request'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Response</CardTitle>
          <CardDescription>
            The model response will appear here.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {send.isError && <GatewayAlert error={send.error} />}

          <div
            aria-busy={send.isPending}
            className="min-h-32 rounded-md border p-4 text-sm whitespace-pre-wrap"
          >
            {text ? (
              <>
                {text}
                {streaming && (
                  <span
                    aria-hidden="true"
                    className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-foreground/60"
                  />
                )}
              </>
            ) : (
              <span className="text-muted-foreground">
                {send.isPending
                  ? 'Waiting for the model...'
                  : reply?.stopped
                    ? 'Stopped before the model answered.'
                    : 'No response yet.'}
              </span>
            )}
          </div>

          {reply && sent && (
            <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 text-sm text-muted-foreground">
              {reply.stopped && (
                <span className="font-medium text-foreground">
                  Stopped early
                </span>
              )}
              {reply.inputTokens === null || reply.outputTokens === null ? (
                <span>Tokens: not reported</span>
              ) : (
                <>
                  <span>
                    Tokens: {reply.inputTokens} in, {reply.outputTokens} out
                  </span>
                  <span>
                    Cost:{' '}
                    {formatMoney(
                      requestCost(
                        sent.model,
                        reply.inputTokens,
                        reply.outputTokens,
                      ),
                    )}
                  </span>
                </>
              )}
              {reply.firstTokenMs !== null && (
                <span>First token: {reply.firstTokenMs} ms</span>
              )}
              <span>
                {sent.stream ? 'Total' : 'Latency'}: {reply.latencyMs} ms
              </span>
              {reply.requestId && <span>Request ID: {reply.requestId}</span>}
            </div>
          )}
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
