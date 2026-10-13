import { NavLink } from 'react-router'
import type { Role } from '@/api/types'
import { cn } from '@/lib/utils'
import { navItemsFor } from './nav'

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center px-5 font-semibold">
        AI Gateway
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {navItemsFor(role).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                isActive &&
                  'bg-sidebar-accent font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
