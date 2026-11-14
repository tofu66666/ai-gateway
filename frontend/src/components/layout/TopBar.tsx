import { useLocation } from 'react-router'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'
import { MobileNav } from './MobileNav'
import { TimeWindowPicker } from './TimeWindowPicker'
import { UserMenu } from './UserMenu'
import { findNavItem } from './nav'

// Each page carries its own heading, so the bar names the page only in the
// browser tab. On a phone, without the sidebar, it shows the product name
// where the time period leaves room.
export function TopBar() {
  const { pathname } = useLocation()
  const item = findNavItem(pathname)

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-card px-4 md:px-6">
      <title>{`${item?.label ?? 'Page not found'} · AI Gateway`}</title>
      <MobileNav />
      <span
        className={cn(
          'flex min-w-0 items-center gap-2 font-semibold md:hidden',
          item?.usesTimeWindow && 'max-sm:hidden',
        )}
      >
        <Logo className="size-5" />
        <span className="truncate">AI Gateway</span>
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {item?.usesTimeWindow && <TimeWindowPicker />}
        <UserMenu />
      </div>
    </header>
  )
}
