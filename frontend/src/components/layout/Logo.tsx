import { cn } from '@/lib/utils'

// The product mark: several routes into one endpoint, as the gateway puts
// many providers behind one API. `public/favicon.svg` is the same drawing.
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn('size-6 shrink-0', className)}
    >
      <rect width="24" height="24" rx="6" fill="var(--primary)" />
      <g fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
        <path d="M7 7c4 0 5 5 10 5" />
        <path d="M7 12h10" />
        <path d="M7 17c4 0 5-5 10-5" />
      </g>
      <g fill="white">
        <circle cx="7" cy="7" r="1.7" />
        <circle cx="7" cy="12" r="1.7" />
        <circle cx="7" cy="17" r="1.7" />
        <circle cx="17" cy="12" r="2.4" />
      </g>
    </svg>
  )
}
