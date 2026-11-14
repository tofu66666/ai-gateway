import { lazy, type ComponentType } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { RequireAuth } from '@/auth/RequireAuth'
import { RequireRole } from '@/auth/RequireRole'
import { AppShell } from '@/components/layout/AppShell'
import { admins, leadsAndAdmins } from '@/components/layout/nav'
import { AuthRoute } from '@/features/auth/AuthRoute'
import { NotFoundPage } from './NotFoundPage'

// Each page is its own download, fetched the first time it is opened, so the
// sign-in page and the first page load faster. AppShell shows a placeholder
// meanwhile.
function lazyPage<Name extends string>(
  load: () => Promise<Record<Name, ComponentType>>,
  name: Name,
) {
  return lazy(() => load().then((module) => ({ default: module[name] })))
}

const AuditLogsPage = lazyPage(
  () => import('@/features/audit/AuditLogsPage'),
  'AuditLogsPage',
)
const BreakdownPage = lazyPage(
  () => import('@/features/breakdown/BreakdownPage'),
  'BreakdownPage',
)
const KeysPage = lazyPage(() => import('@/features/keys/KeysPage'), 'KeysPage')
const ModelsPage = lazyPage(
  () => import('@/features/models/ModelsPage'),
  'ModelsPage',
)
const OverviewPage = lazyPage(
  () => import('@/features/overview/OverviewPage'),
  'OverviewPage',
)
const PlaygroundPage = lazyPage(
  () => import('@/features/playground/PlaygroundPage'),
  'PlaygroundPage',
)
const RequestsPage = lazyPage(
  () => import('@/features/requests/RequestsPage'),
  'RequestsPage',
)
const TeamPage = lazyPage(() => import('@/features/teams/TeamPage'), 'TeamPage')
const TeamsPage = lazyPage(
  () => import('@/features/teams/TeamsPage'),
  'TeamsPage',
)

// One line per page. Add new pages here and to components/layout/nav.ts.
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<AuthRoute />} />
      <Route path="/register" element={<AuthRoute />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="breakdown" element={<BreakdownPage />} />
          <Route path="playground" element={<PlaygroundPage />} />
          <Route element={<RequireRole roles={leadsAndAdmins} />}>
            <Route path="teams" element={<TeamsPage />} />
            <Route path="teams/:teamId" element={<TeamPage />} />
          </Route>
          <Route path="models" element={<ModelsPage />} />
          <Route path="keys" element={<KeysPage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route element={<RequireRole roles={admins} />}>
            <Route path="audit-logs" element={<AuditLogsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}