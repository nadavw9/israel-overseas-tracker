import type { CoverageSummary } from '../domain/coverage'
import { useI18n } from '../i18n/context'

export function CoverageStatus({ coverage }: { coverage: CoverageSummary }) {
  const { messages } = useI18n()
  const status = messages.coverageStatus(coverage.healthy, coverage.required, coverage.complete)

  return (
    <div className={`coverage-status coverage-status--${coverage.complete ? 'complete' : 'incomplete'}`} role="status" aria-label={status}>
      <div className="coverage-status__copy">
        <span>{messages.coverageLedger}</span>
        <strong>{status}</strong>
      </div>
      <div className="coverage-status__segments" aria-hidden="true">
        {Array.from({ length: coverage.required }, (_, index) => (
          <span key={index} data-healthy={index < coverage.healthy} />
        ))}
      </div>
    </div>
  )
}
