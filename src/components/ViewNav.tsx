import { List, Map, Trophy } from 'lucide-react'

export type TrackerView = 'athletes' | 'rankings' | 'map'

type ViewNavProps = {
  view: TrackerView
  onChange: (view: TrackerView) => void
}

const views = [
  { value: 'athletes', label: 'Athletes', icon: List },
  { value: 'rankings', label: 'Rankings', icon: Trophy },
  { value: 'map', label: 'Map', icon: Map },
] as const

export function ViewNav({ view, onChange }: ViewNavProps) {
  return (
    <nav className="view-nav" aria-label="Tracker views">
      {views.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => onChange(value)}
        >
          <Icon size={16} aria-hidden="true" /> {label}
        </button>
      ))}
    </nav>
  )
}
