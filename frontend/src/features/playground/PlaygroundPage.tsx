import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CircleAlert, Send } from 'lucide-react'
import { Link } from 'react-router'

import { GatewayError, sendChat } from '@/api/gateway'
import { useModels } from '@/api/hooks'
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
import { Textarea } from '@/components/ui/textarea'
import { ProcessedIn } from '@/features/models/ProcessedIn'
import { requestCost } from '@/lib/cost'
import { formatMoney } from '@/lib/format'
import { CreateKeyDialog } from './CreateKeyDialog'

type Sent = { model: Model; virtualKey: string; prompt: string }

// H18IALMOND-11: the key decides the project, so the gateway refuses a model
// that project does not allow.
export function PlaygroundPage() {
  const models = useModels()
  const [modelId, setModelId] = useState('')
  const [virtualKey, setVirtualKey] = useState('')
  const [prompt, setPrompt] = useState('')
  const model = models.data?.find((candidate) => candidate.id === modelId)

  const send = useMutation({
    mutationFn: (request: Sent) =>
      sendChat(request.virtualKey, request.model.alias, request.prompt),
  })
  const sent = send.variables

  function handleSend() {
    if (model) {
      send.mutate({ model, virtualKey: virtualKey.trim(), prompt })
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
            Pick a model, then enter your virtual key and a prompt. The key's
            project pays for the call.
          </CardDescription>
          <CardAction>
            <CreateKeyDialog onUse={setVirtualKey} />
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger id="model" className="w-full">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {models.data?.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    <span className="flex items-center gap-2">
                      {option.alias}
                      <ProcessedIn model={option} />
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {models.isError && (
              <p className="text-sm text-destructive">{models.error.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="virtual-key">Virtual API Key</Label>
            <Input
              id="virtual-key"
              type="password"
              value={virtualKey}
              onChange={(event) => setVirtualKey(event.target.value)}
              placeholder="Enter virtual API key"
            />
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

          <div className="flex justify-end">
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
              {send.isPending ? 'Sending...' : 'Send Request'}
            </Button>
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

          <div className="min-h-32 rounded-md border p-4 text-sm whitespace-pre-wrap">
            {send.data ? (
              send.data.content
            ) : (
              <span className="text-muted-foreground">
                {send.isPending ? 'Waiting for the model...' : 'No response yet.'}
              </span>
            )}
          </div>

          {send.data && sent && (
            <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span>
                Tokens: {send.data.inputTokens} in, {send.data.outputTokens} out
              </span>
              <span>
                Cost:{' '}
                {formatMoney(
                  requestCost(
                    sent.model,
                    send.data.inputTokens,
                    send.data.outputTokens,
                  ),
                )}
              </span>
              <span>Latency: {send.data.latencyMs} ms</span>
              {send.data.requestId && (
                <span>Request ID: {send.data.requestId}</span>
              )}
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
      status >= 500 ? 'The provider failed' : (errorTitles[status] ?? 'Request failed')
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
