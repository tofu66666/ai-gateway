import { Boxes } from 'lucide-react'

import { useModels } from '@/api/hooks'
import type { Model } from '@/api/projects'
import { useCurrentUser } from '@/auth/useAuth'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AddModelDialog } from './AddModelDialog'

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
          <CardTitle>Available Models</CardTitle>
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
          {loading && (
            <p className="text-muted-foreground">Loading models...</p>
          )}

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
                    <CardTitle>{model.alias}</CardTitle>
                  </CardHeader>

                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Input Price
                        </p>
                        <p className="font-medium">
                          {formatPrice(model.price_per_1m_input)}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">
                          Output Price
                        </p>
                        <p className="font-medium">
                          {formatPrice(model.price_per_1m_output)}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">
                          Data Processing
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