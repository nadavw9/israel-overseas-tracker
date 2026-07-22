import { Search } from 'lucide-react'
import { useI18n } from '../i18n/context'

export type SportFilter = 'all' | 'basketball' | 'football' | 'hockey'

type FilterBarProps = {
  query: string
  onQueryChange: (query: string) => void
  sport: SportFilter
  onSportChange: (sport: SportFilter) => void
}

const filters: SportFilter[] = ['all', 'basketball', 'football', 'hockey']

export function FilterBar({
  query,
  onQueryChange,
  sport,
  onSportChange,
}: FilterBarProps) {
  const { messages } = useI18n()

  return (
    <div className="filter-bar">
      <label className="search-field">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">{messages.searchLabel}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={messages.searchPlaceholder}
          aria-label={messages.searchLabel}
        />
      </label>
      <div className="sport-filters" aria-label={messages.filterSport}>
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            aria-pressed={sport === filter}
            onClick={() => onSportChange(filter)}
          >
            {messages.sports[filter]}
          </button>
        ))}
      </div>
    </div>
  )
}
