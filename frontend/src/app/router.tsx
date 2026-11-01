import { Navigate, Route, Routes } from 'react-router'
import { RequireAuth } from '@/auth/RequireAuth'
import { RequireRole } from '@/auth/RequireRole'
import { AppShell } from '@/components/layout/AppShell'
import { leadsAndAdmins } from '@/components/layout/nav'
import { AuthRoute } from '@/features/auth/AuthRoute'
import { BreakdownPage } from '@/features/breakdown/BreakdownPage'
import { KeysPage } from '@/features/keys/KeysPage'
import { ModelsPage } from '@/features/models/ModelsPage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { PlaygroundPage } from '@/features/playground/PlaygroundPage'
import { RequestsPage } from '@/features/requests/RequestsPage'
import { TeamPage } from '@/features/teams/TeamPage'
import { TeamsPage } from '@/features/teams/TeamsPage'
import { NotFoundPage } from './NotFoundPage'

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
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
