const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})
const centsMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})
const smallMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
})

// USD with two decimals from $1. Under $1 up to four, so two small amounts
// that differ do not both show as $0.02; under a cent four to six, so the
// cost of one request is not rounded to zero. The API may send Postgres
// numerics as strings.
export function formatMoney(value: number | string) {
  const amount = Number(value)
  if (amount !== 0 && Math.abs(amount) < 0.01) {
    return smallMoney.format(amount)
  }
  if (Math.abs(amount) < 1) {
    return centsMoney.format(amount)
  }
  return money.format(amount)
}

const date = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' })

// "13 Nov 2026", in the viewer's time zone.
export function formatDate(value: string) {
  return date.format(new Date(value))
}

const dateTime = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

// "14 Oct 2026, 11:42 am", in the viewer's time zone.
export function formatDateTime(value: string) {
  return dateTime.format(new Date(value))
}

const shortDateTime = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

// "14 Oct, 11:42 am", for tables; the details show the year.
export function formatShortDateTime(value: string) {
  return shortDateTime.format(new Date(value))
}
