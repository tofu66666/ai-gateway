import { useLocation } from 'react-router'
import { MobileNav } from './MobileNav'
import { TimeWindowPicker } from './TimeWindowPicker'
import { UserMenu } from './UserMenu'
import { findNavItem } from './nav'

export function TopBar() {
  const { pathname } = useLocation()
  const item = findNavItem(pathname)

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-card px-4 md:px-6">
      <MobileNav />
      <h1 className="min-w-0 truncate text-lg font-semibold">
        {item?.label ?? 'Page not found'}
      </h1>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {item?.usesTimeWindow && <TimeWindowPicker />}
        <UserMenu />
      </div>
    </header>
  )
}
