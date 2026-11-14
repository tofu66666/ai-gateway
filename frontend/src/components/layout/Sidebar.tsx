import { NavLink } from 'react-router'
import type { Role } from '@/api/types'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'
import { navGroups, navItemsFor } from './nav'

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2.5 px-5 font-semibold">
        <Logo />
        AI Gateway
      </div>
      <nav className="flex flex-1 flex-col gap-5 px-3 py-2">
        {navGroups.map((group) => {
          const items = navItemsFor(role).filter((item) => item.group === group)
          if (items.length === 0) return null
          return (
            <div
              key={group}
              role="group"
              aria-labelledby={`nav-${group}`}
              className="flex flex-col gap-1"
            >
              <p
                id={`nav-${group}`}
                className="px-3 text-xs font-medium tracking-wide text-muted-foreground/80 uppercase"
              >
                {group}
              </p>
              {items.map((item) => (
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
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
