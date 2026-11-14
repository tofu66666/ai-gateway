import { toast } from 'sonner'
import { formatMoney } from '@/lib/format'
import { AnswerMarkdown } from './AnswerMarkdown'
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
            <div className="rounded-lg border px-3 py-2 text-sm">
              <AnswerMarkdown text={turn.content} />
            </div>
            <AnswerStats answer={turn.answer} />
          </li>
        ),
      )}
      {pending && (
        <>
          <Prompt text={pending.prompt} />
          <li aria-busy="true" className="space-y-1">
            <div className="rounded-lg border px-3 py-2 text-sm">
              {pending.text ? (
                <>
                  <AnswerMarkdown text={pending.text} />
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

// "640 ms" under a second, "5.3 s" from there.
function duration(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

function copyId(id: string) {
  navigator.clipboard
    .writeText(id)
    .then(() => toast.success('Request ID copied'))
    .catch(() => toast.error("Couldn't copy the request ID."))
}

// What one answer used, in a short muted line: tokens in → out, cost, timing
// and the request ID, which copies on click.
function AnswerStats({ answer }: { answer: Answer }) {
  const items = [
    answer.stopped && (
      <span key="stopped" className="font-medium text-foreground">
        Stopped early
      </span>
    ),
    <span key="tokens">
      {answer.inputTokens === null || answer.outputTokens === null
        ? 'Tokens not reported'
        : `${answer.inputTokens.toLocaleString('en-US')} → ${answer.outputTokens.toLocaleString('en-US')} tokens`}
    </span>,
    answer.cost !== null && <span key="cost">{formatMoney(answer.cost)}</span>,
    answer.firstTokenMs !== null && (
      <span key="first">first token {duration(answer.firstTokenMs)}</span>
    ),
    <span key="total">
      {answer.streamed ? 'total' : 'latency'} {duration(answer.latencyMs)}
    </span>,
    answer.requestId && (
      <button
        key="id"
        type="button"
        title={`Copy request ID ${answer.requestId}`}
        onClick={() => copyId(answer.requestId as string)}
        className="rounded font-mono hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {answer.requestId.slice(0, 8)}…
      </button>
    ),
  ].filter(Boolean)

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground tabular-nums">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1.5">
          {index > 0 && <span aria-hidden>·</span>}
          {item}
        </span>
      ))}
    </div>
  )
}
