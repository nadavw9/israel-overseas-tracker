import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('refresh workflow', () => {
  it('runs the performance refresh and uploads its manifest without embedding secrets', () => {
    const workflow = [
      readFileSync('.github/workflows/sync-data.yml', 'utf8'),
      readFileSync('.github/workflows/refresh-performance.yml', 'utf8'),
    ].join('\n')

    expect(workflow).toContain('pnpm refresh:performance')
    expect(workflow).toContain('public/data/refresh-manifest.json')
    expect(workflow).toContain("cron: '30 22 * * *'")
    expect(workflow).toContain('API_FOOTBALL_KEY: ${{ secrets.API_FOOTBALL_KEY }}')
    expect(workflow).not.toMatch(/(?:api[_-]?key|secret)\s*:\s*[^$\s]/i)
  })
})
