import { formatMoney } from '@/lib/format'
import type { Answer, Turn } from './conversations'

export type PendingTurn = {
  prompt: string
  // The answer so far; empty until the first piece arrives.
  text: string
  streaming: boolean
}

type ChatTranscriptProps = {
  turns: Turn[]
  pending: PendingTurn | null
}

// H18IALMOND-62: the chat so far, one turn under another; each answer keeps
// the stats it arrived with.
export function ChatTranscript({ turns, pending }: ChatTranscriptProps) {
  if (turns.length === 0 && !pending) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No messages yet. Write a prompt below to start the chat.
      </p>
    )
  }
  return (
    <ol className="space-y-4">
      {turns.map((turn, index) =>
        turn.role === 'user' ? (
          <Prompt key={index} text={turn.content} />
        ) : (
          <li key={index} className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              {turn.answer.model}
            </p>
            <div className="rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap">
              {turn.content}
            </div>
            <AnswerStats answer={turn.answer} />
          </li>
        ),
      )}
      {pending && (
        <>
          <Prompt text={pending.prompt} />
          <li aria-busy="true" className="space-y-1">
            <div className="rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap">
              {pending.text ? (
                <>
                  {pending.text}
                  {pending.streaming && (
                    <span
                      aria-hidden="true"
                      className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-foreground/60"
                    />
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">
                  Waiting for the model...
                </span>
              )}
            </div>
          </li>
        </>
      )}
    </ol>
  )
}

function Prompt({ text }: { text: string }) {
  return (
    <li className="flex justify-end">
      <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
        {text}
      </div>
    </li>
  )
}

function AnswerStats({ answer }: { answer: Answer }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {answer.stopped && (
        <span className="font-medium text-foreground">Stopped early</span>
      )}
      {answer.inputTokens === null || answer.outputTokens === null ? (
        <span>Tokens: not reported</span>
      ) : (
        <span>
          Tokens: {answer.inputTokens} in, {answer.outputTokens} out
        </span>
      )}
      {answer.cost !== null && <span>Cost: {formatMoney(answer.cost)}</span>}
      {answer.firstTokenMs !== null && (
        <span>First token: {answer.firstTokenMs} ms</span>
      )}
      <span>
        {answer.streamed ? 'Total' : 'Latency'}: {answer.latencyMs} ms
      </span>
      {answer.requestId && <span>Request ID: {answer.requestId}</span>}
    </div>
  )
}
