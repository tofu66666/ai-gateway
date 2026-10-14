import type { Model } from '@/api/projects'

// The gateway's formula (backend app/cost.py): tokens times USD per million.
export function requestCost(
  model: Model,
  inputTokens: number,
  outputTokens: number,
) {
  return (
    (inputTokens * Number(model.price_per_1m_input) +
      outputTokens * Number(model.price_per_1m_output)) /
    1_000_000
  )
}
