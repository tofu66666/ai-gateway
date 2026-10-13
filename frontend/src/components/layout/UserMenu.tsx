import { ChevronDown, CircleUser, LogOut } from 'lucide-react'
import { useAuth, useCurrentUser } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { roleLabels } from './nav'

export function UserMenu() {
  const user = useCurrentUser()
  // RequireAuth sends the person to the sign-in page.
  const { signOut } = useAuth()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" aria-label="User menu">
          <CircleUser />
          <span className="hidden max-w-48 truncate sm:inline">
            {user.email}
          </span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="truncate">{user.email}</div>
          <div className="text-xs font-normal text-muted-foreground">
            {roleLabels[user.role]}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
