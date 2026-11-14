import { Boxes } from 'lucide-react'

import { useModels } from '@/api/hooks'
import type { Model } from '@/api/projects'
import { useCurrentUser } from '@/auth/useAuth'
import { SkeletonLines } from '@/components/layout/Placeholders'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AddModelDialog } from './AddModelDialog'
import { hasMasterPrompt } from './masterPrompt'
import { MasterPromptEditor } from './MasterPromptEditor'

// Admins also get the provider and the provider's model name.
type PricedModel = Model & {
  provider?: string
  model?: string
}

// Prices in full: $0.075 stays $0.075.
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
})

export function ModelsPage() {
  const user = useCurrentUser()
  const query = useModels()
  const models: PricedModel[] = query.data ?? []
  const loading = query.isPending
  const error = query.error?.message ?? ''

  function formatPrice(price?: number) {
    if (price === undefined || price === null) {
      return 'Not available'
    }

    return `${usd.format(Number(price))} / 1M tokens`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Models</h1>
        <p className="text-muted-foreground">
          View the models currently available to you and their pricing.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available models</CardTitle>
          <CardDescription>
            Models available for your account.
          </CardDescription>
          {user.role === 'admin' && (
            <CardAction>
              <AddModelDialog />
            </CardAction>
          )}
        </CardHeader>

        <CardContent>
          {loading && <SkeletonLines rows={3} className="h-24" />}

          {!loading && error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {!loading && !error && models.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Boxes className="size-8 text-muted-foreground" />
              <p className="font-medium">No models available</p>
              <p className="text-sm text-muted-foreground">
                There are currently no models available to your account.
              </p>
            </div>
          )}

          {!loading && !error && models.length > 0 && (
            <div className="space-y-3">
              {models.map((model) => (
                <Card key={model.id} size="sm">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      {model.alias}
                      {/* Embedding and completion models don't chat. */}
                      {model.kind && model.kind !== 'chat' && (
                        <Badge variant="outline">{model.kind}</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Input price
                        </p>
                        <p className="font-medium">
                          {formatPrice(model.price_per_1m_input)}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">
                          Output price
                        </p>
                        <p className="font-medium">
                          {formatPrice(model.price_per_1m_output)}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">
                          Data processing
                        </p>
                        <p className="font-medium">
                          {model.data_processing_country ?? 'Not specified'}
                        </p>
                      </div>

                      {model.provider && (
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Provider
                          </p>
                          <p className="font-medium">
                            {model.provider} / {model.model}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* H18IALMOND-56: only admins get the text itself, and
                        edit it in place. */}
                    {user.role === 'admin' && (
                      <div className="mt-4">
                        <MasterPromptEditor model={model} />
                      </div>
                    )}

                    {user.role !== 'admin' && hasMasterPrompt(model) && (
                      <div className="mt-4">
                        <p className="text-sm text-muted-foreground">
                          Master prompt
                        </p>
                        <p className="line-clamp-3 text-sm wrap-break-word whitespace-pre-wrap">
                          {model.prompt ??
                            'Set by an admin. Every chat request to this model starts with it, and it counts as input tokens.'}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}