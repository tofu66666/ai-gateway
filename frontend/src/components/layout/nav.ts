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

// The sidebar's sections, in order.
export const navGroups = ['Analytics', 'Gateway', 'Manage'] as const

export type NavItem = {
  path: string
  label: string
  icon: LucideIcon
  roles: Role[]
  group: (typeof navGroups)[number]
  usesTimeWindow?: boolean
}

const everyone: Role[] = ['user', 'team_lead', 'admin']
export const leadsAndAdmins: Role[] = ['team_lead', 'admin']
export const admins: Role[] = ['admin']

// The 3.b navigation map's pages, grouped: what was spent, what calls the
// models, and who may do what.
export const navItems: NavItem[] = [
  {
    path: '/overview',
    label: 'Overview',
    icon: LayoutDashboard,
    roles: everyone,
    group: 'Analytics',
    usesTimeWindow: true,
  },
  {
    path: '/breakdown',
    label: 'Breakdown',
    icon: ChartColumnStacked,
    roles: everyone,
    group: 'Analytics',
    usesTimeWindow: true,
  },
  {
    path: '/requests',
    label: 'Requests',
    icon: ListOrdered,
    roles: everyone,
    group: 'Analytics',
    usesTimeWindow: true,
  },
  {
    path: '/playground',
    label: 'Playground',
    icon: MessageSquareText,
    roles: everyone,
    group: 'Gateway',
  },
  {
    path: '/models',
    label: 'Models',
    icon: Boxes,
    roles: everyone,
    group: 'Gateway',
  },
  {
    path: '/keys',
    label: 'Keys',
    icon: KeyRound,
    roles: everyone,
    group: 'Gateway',
  },
  {
    path: '/teams',
    label: 'Teams & projects',
    icon: Users,
    roles: leadsAndAdmins,
    group: 'Manage',
  },
  {
    path: '/audit-logs',
    label: 'Audit log',
    icon: ScrollText,
    roles: admins,
    group: 'Manage',
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