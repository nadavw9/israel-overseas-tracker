import { Globe2, ShieldCheck } from 'lucide-react'

export function AppHeader() {
  return (
    <header className="app-header">
      <a className="brand" href="#tracker-title" aria-label="Israel Overseas home">
        <span className="brand__mark" aria-hidden="true">IL</span>
        <span>
          <strong>Israeli Athletes</strong>
          <small>Overseas tracker</small>
        </span>
      </a>
      <div className="app-header__status">
        <span><ShieldCheck size={15} aria-hidden="true" /> Sources attached</span>
        <span><Globe2 size={15} aria-hidden="true" /> Global</span>
      </div>
    </header>
  )
}
