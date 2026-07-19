import { Search } from 'lucide-react'

export type SportFilter = 'all' | 'basketball' | 'football' | 'hockey'

type FilterBarProps = {
  query: string
  onQueryChange: (query: string) => void
  sport: SportFilter
  onSportChange: (sport: SportFilter) => void
}

const filters: Array<{ value: SportFilter; label: string }> = [
  { value: 'all', label: 'All sports' },
  { value: 'basketball', label: 'Basketball' },
  { value: 'football', label: 'Football' },
  { value: 'hockey', label: 'Hockey' },
]

export function FilterBar({
  query,
  onQueryChange,
  sport,
  onSportChange,
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      <label className="search-field">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">Search athletes</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search athletes, teams, competitions…"
          aria-label="Search athletes"
        />
      </label>
      <div className="sport-filters" aria-label="Filter by sport">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={sport === filter.value}
            onClick={() => onSportChange(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  )
}
