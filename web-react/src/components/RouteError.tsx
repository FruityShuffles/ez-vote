import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

import { H1, Muted } from '@/components/ui/typography'

export function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`.trim()
    : 'Something went wrong while loading this page.'

  return (
    <div className="flex flex-col gap-2" role="alert">
      <H1>Something went wrong</H1>
      <Muted>{message}</Muted>
    </div>
  )
}
