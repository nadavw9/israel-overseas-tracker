import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('privacy defaults', () => {
  it('does not contact a third-party font service on every page load', () => {
    const styles = [
      readFileSync('src/index.css', 'utf8'),
      readFileSync('src/app/styles.css', 'utf8'),
    ].join('\n')

    expect(styles).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/i)
  })
})
