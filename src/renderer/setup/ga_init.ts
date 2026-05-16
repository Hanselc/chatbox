import platforms from '@/platform'
import { initSettingsStore } from '@/stores/settingsStore'

void (async () => {
  try {
    const settings = await initSettingsStore()
    if (!settings.allowReportingAndTracking) {
      return
    }

    const isDesktop = platforms.type === 'desktop'
    const plausibleDomain = isDesktop ? 'app.chatboxai.app' : 'web.chatboxai.app'
    const plausibleSrc = isDesktop
      ? 'https://plausible.midway.run/js/script.local.hash.js'
      : 'https://plausible.midway.run/js/script.js'

    // Dynamically inject Google Analytics (gtag.js)
    const gtagScript = document.createElement('script')
    gtagScript.async = true
    gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-B365F44W6E'
    document.head.appendChild(gtagScript)

    // Dynamically inject Plausible
    const plausibleScript = document.createElement('script')
    plausibleScript.defer = true
    plausibleScript.setAttribute('data-domain', plausibleDomain)
    plausibleScript.src = plausibleSrc
    document.head.appendChild(plausibleScript)

    platforms.initTracking()
  } catch (e) {
    console.error(e)
  }
})()
