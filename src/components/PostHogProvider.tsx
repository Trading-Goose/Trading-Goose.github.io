import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    // Track page views
    posthog.capture('$pageview', {
      $current_url: window.location.href,
      $pathname: location.pathname,
      $navigation_type: navigationType,
    })
  }, [location, navigationType])

  return <PHProvider client={posthog}>{children}</PHProvider>
}