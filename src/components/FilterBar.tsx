import { Search } from 'lucide-react'
import type { AthleteTier, GenderCategory, LifecycleStatus, Sport } from '../domain/taxonomy'
import { useI18n } from '../i18n/context'

export type DirectoryFilters = {
  sport: 'all' | Sport
  tier: 'all' | AthleteTier
  gender: 'all' | GenderCategory
  status: 'all' | LifecycleStatus
}

type FilterBarProps = {
  query: string
  onQueryChange: (query: string) => void
  filters: DirectoryFilters
  onFiltersChange: (filters: DirectoryFilters) => void
  sports: Sport[]
}

const tiers: DirectoryFilters['tier'][] = ['all', 'senior-professional', 'college', 'development', 'international-circuit']
const genders: DirectoryFilters['gender'][] = ['all', 'men', 'women', 'mixed', 'open']
const statuses: DirectoryFilters['status'][] = ['all', 'active', 'injured', 'inactive', 'free-agent', 'retired', 'unknown']

export function FilterBar({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  sports,
}: FilterBarProps) {
  const { locale, messages } = useI18n()
  const update = <Key extends keyof DirectoryFilters>(key: Key, value: DirectoryFilters[Key]) => {
    onFiltersChange({ ...filters, [key]: value })
  }

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
        {(['all', ...sports] as DirectoryFilters['sport'][]).map((sport) => (
          <button
            key={sport}
            type="button"
            aria-pressed={filters.sport === sport}
            onClick={() => update('sport', sport)}
          >
            {messages.sports[sport]}
          </button>
        ))}
      </div>
      <div className="filter-dimensions" dir={locale === 'he' ? 'rtl' : 'ltr'}>
        <label>
          <span>{messages.filterTier}</span>
          <select value={filters.tier} onChange={(event) => update('tier', event.target.value as DirectoryFilters['tier'])}>
            {tiers.map((tier) => <option key={tier} value={tier}>{messages.tiers[tier]}</option>)}
          </select>
        </label>
        <label>
          <span>{messages.filterGender}</span>
          <select value={filters.gender} onChange={(event) => update('gender', event.target.value as DirectoryFilters['gender'])}>
            {genders.map((gender) => <option key={gender} value={gender}>{messages.genders[gender]}</option>)}
          </select>
        </label>
        <label>
          <span>{messages.filterStatus}</span>
          <select value={filters.status} onChange={(event) => update('status', event.target.value as DirectoryFilters['status'])}>
            {statuses.map((status) => <option key={status} value={status}>{messages.lifecycleStatuses[status]}</option>)}
          </select>
        </label>
      </div>
    </div>
  )
}
