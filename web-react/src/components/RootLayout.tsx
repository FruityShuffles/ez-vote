import { useEffect } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom'

export function RootLayout() {
  const { pathname } = useLocation()

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
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
