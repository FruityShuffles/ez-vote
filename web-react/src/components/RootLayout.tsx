import { useEffect } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom'

export function RootLayout() {
  const { pathname } = useLocation()

  useEffect(() => {
    const activeAtNavigation = document.activeElement
    const frame = window.requestAnimationFrame(() => {
      const activeNow = document.activeElement
      if (
        activeNow !== activeAtNavigation &&
        activeNow !== document.body &&
        activeNow !== document.documentElement
      ) {
        return
      }
      document.querySelector<HTMLElement>('[data-route-focus]')?.focus({
        preventScroll: true,
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [pathname])

  return (
    <>
      <Outlet />
      <ScrollRestoration />
    </>
  )
}
