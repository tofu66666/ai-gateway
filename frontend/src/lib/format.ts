const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})
const smallMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})

// USD with two decimals; amounts under a cent show four. The API may send
// Postgres numerics as strings.
export function formatMoney(value: number | string) {
  const amount = Number(value)
  if (amount !== 0 && Math.abs(amount) < 0.01) {
    return smallMoney.format(amount)
  }
  return money.format(amount)
}
