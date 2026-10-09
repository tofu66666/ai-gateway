import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { AuthRoute } from '@/features/auth/AuthRoute'
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
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="playground" element={<PlaygroundPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="teams/:teamId" element={<TeamPage />} />
        <Route path="models" element={<ModelsPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
