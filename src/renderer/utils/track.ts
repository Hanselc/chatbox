import { settingsStore } from '@/stores/settingsStore'

export function trackEvent(event: string, props: Record<string, unknown> = {}) {
  const allowReportingAndTracking = settingsStore.getState().allowReportingAndTracking
  if (!allowReportingAndTracking) {
    return
  }
  if ((window as any).plausible) {
    ;(window as any).plausible(event, { props })
  }
}
