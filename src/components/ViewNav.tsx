import { List, Trophy } from 'lucide-react'
import { useI18n } from '../i18n/context'

export type TrackerView = 'athletes' | 'rankings'

type ViewNavProps = {
  view: TrackerView
  onChange: (view: TrackerView) => void
}

const views = [
  { value: 'athletes', icon: List },
  { value: 'rankings', icon: Trophy },
] as const

export function ViewNav({ view, onChange }: ViewNavProps) {
  const { messages } = useI18n()

  return (
    <nav className="view-nav" aria-label={messages.viewsLabel}>
      {views.map(({ value, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => onChange(value)}
        >
          <Icon size={16} aria-hidden="true" /> {messages.views[value]}
        </button>
      ))}
    </nav>
  )
}
