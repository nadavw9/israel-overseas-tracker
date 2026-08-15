import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('refresh workflow', () => {
  it('runs the performance refresh and uploads its manifest without embedding secrets', () => {
    const workflow = [
      readFileSync('.github/workflows/sync-data.yml', 'utf8'),
      readFileSync('.github/workflows/refresh-performance.yml', 'utf8'),
    ].join('\n')

    expect(workflow).toContain('pnpm refresh:performance')
    expect(workflow).toContain('public/data/refresh-manifest.json')
    expect(workflow).toContain("cron: '30 20 * * *'")
    expect(workflow).toContain('API_FOOTBALL_KEY: ${{ secrets.API_FOOTBALL_KEY }}')
    expect(workflow).not.toMatch(/(?:api[_-]?key|secret)\s*:\s*[^$\s]/i)
  })

  it('persists nightly verified data late in the Israeli day', () => {
    const syncWorkflow = readFileSync('.github/workflows/sync-data.yml', 'utf8')
    const performanceWorkflow = readFileSync('.github/workflows/refresh-performance.yml', 'utf8')

    expect(syncWorkflow).toContain("cron: '17 20 * * *'")
    expect(performanceWorkflow).toContain("cron: '30 20 * * *'")
    for (const workflow of [syncWorkflow, performanceWorkflow]) {
      expect(workflow).toContain('contents: write')
      expect(workflow).toContain('github-actions[bot]')
      expect(workflow).toContain('git push')
    }
  })

  it('deploys a repository-aware Vite build to GitHub Pages', () => {
    const workflowPath = '.github/workflows/deploy-pages.yml'
    expect(existsSync(workflowPath)).toBe(true)
    if (!existsSync(workflowPath)) return

    const workflow = readFileSync(workflowPath, 'utf8')
    const appSource = readFileSync('src/App.tsx', 'utf8')
    const viteConfig = readFileSync('vite.config.ts', 'utf8')

    expect(workflow).toContain('actions/configure-pages@v5')
    expect(workflow).toContain('actions/upload-pages-artifact@v4')
    expect(workflow).toContain('actions/deploy-pages@v4')
    expect(workflow).toContain('path: dist')
    expect(appSource).toContain('import.meta.env.BASE_URL')
    expect(viteConfig).toContain("'/israel-overseas-tracker/'")
  })
})
