import {
  Boxes,
  ChartColumnStacked,
  KeyRound,
  LayoutDashboard,
  ListOrdered,
  MessageSquareText,
  ScrollText,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/api/types'

export type NavItem = {
  path: string
  label: string
  icon: LucideIcon
  roles: Role[]
  usesTimeWindow?: boolean
}

const everyone: Role[] = ['user', 'team_lead', 'admin']
export const leadsAndAdmins: Role[] = ['team_lead', 'admin']
export const admins: Role[] = ['admin']

// Same order as the admin sidebar in the 3.b navigation map.
export const navItems: NavItem[] = [
  {
    path: '/overview',
    label: 'Overview',
    icon: LayoutDashboard,
    roles: everyone,
    usesTimeWindow: true,
  },
  {
    path: '/breakdown',
    label: 'Breakdown',
    icon: ChartColumnStacked,
    roles: everyone,
    usesTimeWindow: true,
  },
  {
    path: '/playground',
    label: 'Playground',
    icon: MessageSquareText,
    roles: everyone,
  },
  {
    path: '/teams',
    label: 'Teams & projects',
    icon: Users,
    roles: leadsAndAdmins,
  },
  { path: '/models', label: 'Models', icon: Boxes, roles: everyone },
  {
    path: '/keys',
    label: 'Keys',
    icon: KeyRound,
    roles: everyone,
  },
  {
    path: '/requests',
    label: 'Requests',
    icon: ListOrdered,
    roles: everyone,
    usesTimeWindow: true,
  },
  {
    path: '/audit-logs',
    label: 'Audit Logs',
    icon: ScrollText,
    roles: admins,
  },
]

export const roleLabels: Record<Role, string> = {
  user: 'User',
  team_lead: 'Team lead',
  admin: 'Admin',
}

export function navItemsFor(role: Role) {
  return navItems.filter((item) => item.roles.includes(role))
}

export function findNavItem(pathname: string) {
  return navItems.find(
    (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
  )
}