import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { MAX_PROMPT_LENGTH } from './masterPrompt'

// Focus with the caret after the text, for an editor that opens on the box.
function focusAtEnd(box: HTMLTextAreaElement | null) {
  box?.focus()
  box?.setSelectionRange(box.value.length, box.value.length)
}

// The master prompt box of the Add model form and the master prompt editor.
export function PromptField({
  id,
  value,
  onChange,
  autoFocus,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
}) {
  const tooLong = value.length > MAX_PROMPT_LENGTH

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>Master prompt</Label>
        <span
          className={cn(
            'text-xs tabular-nums',
            tooLong ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {value.length} / {MAX_PROMPT_LENGTH}
        </span>
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Optional, for example: Answer in plain English. Do not write code."
        aria-invalid={tooLong}
        aria-describedby={`${id}-hint`}
        ref={autoFocus ? focusAtEnd : undefined}
        className="max-h-60"
      />
      <p
        id={`${id}-hint`}
        className={cn(
          'text-xs',
          tooLong ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {tooLong
          ? `Too long: keep it to ${MAX_PROMPT_LENGTH} characters.`
          : 'Sent before every chat request to this model, so it counts as input tokens.'}
      </p>
    </div>
  )
}
