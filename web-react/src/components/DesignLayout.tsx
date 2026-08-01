import { Outlet } from 'react-router-dom'

import { AppShell } from '@/components/ui/app-shell'

export function DesignLayout() {
  return (
    <AppShell width="lg" brandTo="/design">
      <Outlet />
    </AppShell>
  )
}
