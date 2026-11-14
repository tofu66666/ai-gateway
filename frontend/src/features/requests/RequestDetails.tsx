import { ChevronRight, Copy, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Fragment } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

// H18IALMOND-41: one request in full, in a panel from the right as log
// viewers show it: who sent it, through which key and model, and what it
// used. Usage only; prompts and responses are not shown.
export function RequestDetails({
  requestId,
  time,
  fields,
  compact = false,
}: {
  requestId: string
  time: string
  fields: [name: string, value: string][]
  // An arrow instead of the word, where a table row is short of room.
  compact?: boolean
}) {
  function copy() {
    navigator.clipboard
      .writeText(requestId)
      .then(() => toast.success('Request ID copied'))
      .catch(() => toast.error("Couldn't copy. Select the ID and copy it."))
  }

  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size={compact ? 'icon-sm' : 'sm'}
          aria-label={`Details of the request at ${time}`}
        >
          {compact ? <ChevronRight /> : 'Details'}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-6 overflow-y-auto border-l bg-popover p-6 text-sm text-popover-foreground shadow-lg duration-200 outline-none data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogPrimitive.Title className="text-base font-medium">
                Request at {time}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-muted-foreground">
                Usage only: prompts and responses are not shown.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="flex items-center gap-2 rounded-md bg-muted py-1 pr-1 pl-3">
            <code
              title={requestId}
              className="min-w-0 flex-1 truncate font-mono text-xs"
            >
              {requestId}
            </code>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy the request ID"
              onClick={copy}
            >
              <Copy />
            </Button>
          </div>

          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
            {fields.map(([name, value]) => (
              <Fragment key={name}>
                <dt className="text-muted-foreground">{name}</dt>
                <dd className="font-medium wrap-anywhere tabular-nums">
                  {value}
                </dd>
              </Fragment>
            ))}
          </dl>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
