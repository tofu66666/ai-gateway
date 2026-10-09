import { useState, type ReactNode } from 'react'
import { TimeWindowContext, type TimeWindow } from '@/lib/time-window'

export function TimeWindowProvider({ children }: { children: ReactNode }) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('this_month')

  return (
    <TimeWindowContext value={{ timeWindow, setTimeWindow }}>
      {children}
    </TimeWindowContext>
  )
}
