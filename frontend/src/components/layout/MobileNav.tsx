import { Menu } from 'lucide-react'
import { Link } from 'react-router'
import { useCurrentUser } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { navGroups, navItemsFor } from './nav'

export function MobileNav() {
  const user = useCurrentUser()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open menu"
        >
          <Menu />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {navGroups.map((group, index) => {
          const items = navItemsFor(user.role).filter(
            (item) => item.group === group,
          )
          if (items.length === 0) return null
          return (
            <DropdownMenuGroup key={group}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs text-muted-foreground uppercase">
                {group}
              </DropdownMenuLabel>
              {items.map((item) => (
                <DropdownMenuItem key={item.path} asChild>
                  <Link to={item.path}>
                    <item.icon />
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
