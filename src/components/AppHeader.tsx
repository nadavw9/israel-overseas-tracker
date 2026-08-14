import { Activity, Globe2, ShieldCheck } from 'lucide-react'
import { Languages } from 'lucide-react'
import type { RefreshManifest } from '../domain/refresh'
import { useI18n } from '../i18n/context'

function formatRefreshAt(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(value))
}

export function AppHeader({
  onToggleLocale,
  refreshManifest,
}: {
  onToggleLocale: () => void
  refreshManifest: RefreshManifest | null
}) {
  const { messages } = useI18n()
  const failedProviders = refreshManifest?.providers.reduce(
    (total, provider) => total + provider.failed,
    0,
  ) ?? 0
  const checkedAthletes = refreshManifest === null
    ? 0
    : refreshManifest.unboundSkipped + refreshManifest.providers.reduce(
      (total, provider) => total + provider.attempted,
      0,
    )
  const refreshLabel = refreshManifest === null
    ? messages.refreshUnavailable
    : failedProviders === 0
      ? messages.refreshHealthy(formatRefreshAt(refreshManifest.generatedAt, messages.locale), checkedAthletes)
      : messages.refreshDegraded(formatRefreshAt(refreshManifest.generatedAt, messages.locale), failedProviders)

  return (
    <header className="app-header">
      <a className="brand" href="#tracker-title" aria-label={messages.home}>
        <span className="brand__mark" aria-hidden="true">IL</span>
        <span>
          <strong>{messages.brandTitle}</strong>
          <small>{messages.brandSubtitle}</small>
        </span>
      </a>
      <div className="app-header__status">
        <span><ShieldCheck size={15} aria-hidden="true" /> {messages.sourcesAttached}</span>
        <span><Globe2 size={15} aria-hidden="true" /> {messages.global}</span>
        <span className={`refresh-status refresh-status--${refreshManifest === null ? 'unavailable' : failedProviders === 0 ? 'healthy' : 'degraded'}`} role="status">
          <Activity size={15} aria-hidden="true" /> {refreshLabel}
        </span>
        <button type="button" className="locale-toggle" onClick={onToggleLocale}>
          <Languages size={15} aria-hidden="true" /> {messages.languageToggle}
        </button>
      </div>
    </header>
  )
}
