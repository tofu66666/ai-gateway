import { CalendarDays } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { timeWindows, useTimeWindow, type TimeWindow } from '@/lib/time-window'
import { cn } from '@/lib/utils'

// The period every chart and figure on the page covers: three buttons side by
// side on a laptop, a menu on smaller screens.
export function TimeWindowPicker() {
  const { timeWindow, setTimeWindow } = useTimeWindow()

  return (
    <>
      <div
        role="group"
        aria-label="Time window"
        className="hidden h-9 items-center rounded-lg bg-muted p-[3px] lg:inline-flex"
      >
        {timeWindows.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === timeWindow}
            onClick={() => setTimeWindow(option.value)}
            className={cn(
              'h-full rounded-md px-2.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
              option.value === timeWindow &&
                'bg-background text-foreground shadow-sm',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <Select
        value={timeWindow}
        onValueChange={(value) => setTimeWindow(value as TimeWindow)}
      >
        <SelectTrigger className="w-36 lg:hidden" aria-label="Time window">
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
    </>
  )
}
