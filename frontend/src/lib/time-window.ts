import { createContext, useContext } from 'react'

// Custom ranges come with the dashboard filters (H18IALMOND-14).
export type TimeWindow = 'this_month' | 'last_7_days' | 'last_30_days'

export const timeWindows: { value: TimeWindow; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
]

type TimeWindowState = {
  timeWindow: TimeWindow
  setTimeWindow: (value: TimeWindow) => void
}

export const TimeWindowContext = createContext<TimeWindowState | null>(null)

export function useTimeWindow() {
  const state = useContext(TimeWindowContext)
  if (!state) {
    throw new Error('useTimeWindow must be used inside TimeWindowProvider')
  }
  return state
}
