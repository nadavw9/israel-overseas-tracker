import { Globe2, ShieldCheck } from 'lucide-react'
import { Languages } from 'lucide-react'
import { useI18n } from '../i18n/context'

export function AppHeader({ onToggleLocale }: { onToggleLocale: () => void }) {
  const { messages } = useI18n()

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
        <button type="button" className="locale-toggle" onClick={onToggleLocale}>
          <Languages size={15} aria-hidden="true" /> {messages.languageToggle}
        </button>
      </div>
    </header>
  )
}
