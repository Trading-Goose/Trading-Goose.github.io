import posthog from 'posthog-js'

export const initPostHog = () => {
  const apiKey = import.meta.env.VITE_POSTHOG_API_KEY
  const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

  if (typeof window !== 'undefined' && apiKey) {
    posthog.init(
      apiKey,
      {
        api_host: apiHost,
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: true,
        disable_session_recording: false,
        persistence: 'memory',  // Use memory storage for cookieless tracking
        persistence_name: `ph_${apiKey}_posthog`,  // Custom persistence name
        loaded: (posthog) => {
          if (import.meta.env.DEV) {
            posthog.debug()
          }
        }
      }
    )
  }
  return posthog
}

export default posthog