import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { queryKeys } from '@/api/hooks'
import { rotateKey } from '@/api/keys'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/format'

export function RotateKeyDialog({ keyId }: { keyId: string }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const rotate = useMutation({
    mutationFn: rotateKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.keys })
    },
  })

  const created = rotate.data

  function changeOpen(next: boolean) {
    setOpen(next)

    if (!next) {
      // Closing forgets the new raw key, so it is shown only once.
      rotate.reset()
    }
  }

  function copy(key: string) {
    navigator.clipboard
      .writeText(key)
      .then(() => toast.success('Key copied'))
      .catch(() => toast.error("Couldn't copy. Select the key and copy it."))
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <RotateCw />
          Rotate
        </Button>
      </DialogTrigger>

      <DialogContent
        onInteractOutside={(event) => {
          if (created) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (created) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {created ? 'Your new key' : 'Rotate key'}
          </DialogTitle>
          <DialogDescription>
            {created
              ? 'Copy it now: it is shown only once. The old key no longer works.'
              : 'The current key will stop working immediately.'}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                readOnly
                aria-label="Rotated key"
                value={created.key}
                className="font-mono text-xs"
                onFocus={(event) => event.target.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copy key"
                onClick={() => copy(created.key)}
              >
                <Copy />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              Expires {formatDate(created.expires_at)}.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm">
              Are you sure you want to replace this key with a new one?
            </p>

            {rotate.isError && (
              <p className="text-sm text-destructive">
                {rotate.error.message}
              </p>
            )}
          </>
        )}

        <DialogFooter>
          {created ? (
            <Button type="button" onClick={() => changeOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => changeOpen(false)}
              >
                Cancel
              </Button>

              <Button
                type="button"
                disabled={rotate.isPending}
                onClick={() => rotate.mutate(keyId)}
              >
                {rotate.isPending ? 'Rotating...' : 'Rotate key'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}