import { usePostHog as usePostHogReact } from 'posthog-js/react'
import posthog from '@/lib/posthog'

export const usePostHog = () => {
  const posthogFromHook = usePostHogReact()
  return posthogFromHook || posthog
}

// Helper function to identify users
export const identifyUser = (userId: string, traits?: Record<string, any>) => {
  posthog.identify(userId, traits)
}

// Helper function to track custom events
export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
  posthog.capture(eventName, properties)
}

// Helper function to track conversions
export const trackConversion = (conversionType: string, value?: number) => {
  posthog.capture('conversion', {
    type: conversionType,
    value: value,
    timestamp: new Date().toISOString(),
  })
}