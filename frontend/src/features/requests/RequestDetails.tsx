import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

// H18IALMOND-41: one request in full: who sent it, through which key and
// model, and what it used. Usage only; prompts and responses are not shown.
export function RequestDetails({
  time,
  fields,
}: {
  time: string
  fields: [name: string, value: string][]
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Details of the request at ${time}`}
        >
          Details
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request at {time}</DialogTitle>
          <DialogDescription>
            Usage only: prompts and responses are not shown.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          {fields.map(([name, value]) => (
            <Fragment key={name}>
              <dt className="text-muted-foreground">{name}</dt>
              <dd className="font-medium wrap-anywhere">{value}</dd>
            </Fragment>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
