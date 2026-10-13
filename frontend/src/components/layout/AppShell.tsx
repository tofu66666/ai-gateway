import { Outlet } from 'react-router'
import { useCurrentUser } from '@/auth/useAuth'
import { Sidebar } from './Sidebar'
import { TimeWindowProvider } from './TimeWindowProvider'
import { TopBar } from './TopBar'

export function AppShell() {
  const user = useCurrentUser()

  return (
    <TimeWindowProvider>
      <div className="flex min-h-svh">
        <Sidebar role={user.role} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </TimeWindowProvider>
  )
}
