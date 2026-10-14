const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})
const smallMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
})

// USD with two decimals; amounts under a cent show four to six, so the cost
// of one request is not rounded to zero. The API may send Postgres numerics
// as strings.
export function formatMoney(value: number | string) {
  const amount = Number(value)
  if (amount !== 0 && Math.abs(amount) < 0.01) {
    return smallMoney.format(amount)
  }
  return money.format(amount)
}

const date = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' })

// "13 Nov 2026", in the viewer's time zone.
export function formatDate(value: string) {
  return date.format(new Date(value))
}
