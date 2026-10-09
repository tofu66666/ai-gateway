import { CalendarDays } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { timeWindows, useTimeWindow, type TimeWindow } from '@/lib/time-window'

export function TimeWindowPicker() {
  const { timeWindow, setTimeWindow } = useTimeWindow()

  return (
    <Select
      value={timeWindow}
      onValueChange={(value) => setTimeWindow(value as TimeWindow)}
    >
      <SelectTrigger className="w-36" aria-label="Time window">
        <CalendarDays />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {timeWindows.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
