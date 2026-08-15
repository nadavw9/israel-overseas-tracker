import { ChevronDown } from 'lucide-react'
import type { CoverageSummary, PublicCoverageEntry } from '../domain/coverage'
import { useI18n } from '../i18n/context'

type CoverageLedgerPanelProps = {
  coverage: CoverageSummary
}

function formatCoverageDate(value: string | undefined, locale: string) {
  if (value === undefined) return null
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value))
}

function coverageCounts(entry: PublicCoverageEntry, messages: ReturnType<typeof useI18n>['messages']) {
  if (entry.counts === undefined) return messages.coverageCountsPending
  return messages.coverageCounts(
    entry.counts.observed,
    entry.counts.matched,
    entry.counts.newCandidates,
    entry.counts.outOfScope,
    entry.counts.unresolved,
    entry.counts.conflicts,
  )
}

export function CoverageLedgerPanel({ coverage }: CoverageLedgerPanelProps) {
  const { messages } = useI18n()
  const entries = coverage.entries ?? []
  if (entries.length === 0) {
    return (
      <section className="coverage-ledger-panel coverage-ledger-panel--summary-only" role="status">
        <div className="coverage-ledger-panel__summary">
          <span>{messages.coverageDetailsTitle}</span>
          <strong>{messages.coverageDetailsSummary(coverage.healthy, coverage.required, coverage.complete)}</strong>
          <small>{messages.coverageDetailsUnavailable}</small>
        </div>
      </section>
    )
  }

  return (
    <details className="coverage-ledger-panel">
      <summary>
        <span>{messages.coverageDetailsTitle}</span>
        <strong>{messages.coverageDetailsSummary(coverage.healthy, coverage.required, coverage.complete)}</strong>
        <small>{messages.coverageDetailsHint}</small>
        <ChevronDown className="coverage-ledger-panel__chevron" size={16} aria-hidden="true" />
      </summary>
      <div className="coverage-ledger-panel__entries">
        {entries.map((entry) => {
          const lastAttempt = formatCoverageDate(entry.lastAttemptAt, messages.locale)
          const lastSuccess = formatCoverageDate(entry.lastSuccessAt, messages.locale)
          return (
            <article
              key={entry.id}
              className={`coverage-ledger-card coverage-ledger-card--${entry.health}`}
            >
              <header>
                <div>
                  <span>
                    {messages.sports[entry.sport]} · {messages.genders[entry.genderCategory]} · {messages.tiers[entry.tier]}
                  </span>
                  <h3>{entry.universe}</h3>
                </div>
                <strong>{messages.coverageHealth[entry.health]}</strong>
              </header>
              <dl>
                <div>
                  <dt>{messages.coverageLabels.cadence}</dt>
                  <dd>{messages.coverageCadences[entry.cadence]}</dd>
                </div>
                <div>
                  <dt>{messages.coverageLabels.sourceType}</dt>
                  <dd>{messages.coverageSourceTypes[entry.sourceType]}</dd>
                </div>
                <div>
                  <dt>{messages.coverageLabels.lastScan}</dt>
                  <dd>{lastSuccess ?? lastAttempt ?? messages.coverageCountsPending}</dd>
                </div>
                <div>
                  <dt>{messages.coverageLabels.counts}</dt>
                  <dd>{coverageCounts(entry, messages)}</dd>
                </div>
              </dl>
              <ul aria-label={messages.coverageLabels.limitations}>
                {entry.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
              </ul>
              <a href={entry.sourceUrl} target="_blank" rel="noreferrer">
                {messages.coverageSourceCta}
              </a>
            </article>
          )
        })}
      </div>
    </details>
  )
}
