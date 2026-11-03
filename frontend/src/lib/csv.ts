// CSV files for the request log (H18IALMOND-41) and the Breakdown
// (H18IALMOND-31).

// A cell that starts like a formula (=, +, -, @) gets a leading ', so a
// spreadsheet shows it as text instead of running it; cells with commas,
// quotes or line breaks are quoted.
function cell(value: string | number) {
  if (typeof value === 'number') return String(value)
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

export function toCsv(rows: (string | number)[][]) {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n')
}

// Saves the text as `<name>_<today>.csv`, today in the viewer's time zone; the
// byte order mark lets Excel read it as UTF-8.
export function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}_${new Date().toLocaleDateString('en-CA')}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url))
}
