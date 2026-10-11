import { useEffect, useState } from 'react'
import { Boxes } from 'lucide-react'

import { getModels } from '@/api/projects'
import type { Model } from '@/api/projects'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type PricedModel = Model & {
  data_processing_country?: string
  price_per_1m_input?: number
  price_per_1m_output?: number
}

export function ModelsPage() {
  const [models, setModels] = useState<PricedModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadModels() {
      try {
        setError('')
        setModels(await getModels())
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load models',
        )
      } finally {
        setLoading(false)
      }
    }

    loadModels()
  }, [])

  function formatPrice(price?: number) {
    if (price === undefined || price === null) {
      return 'Not available'
    }

    return `$${Number(price).toFixed(2)} / 1M tokens`
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
                    <div className="grid gap-4 md:grid-cols-3">
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