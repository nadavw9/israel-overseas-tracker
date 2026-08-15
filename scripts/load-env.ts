import { loadEnvFile } from 'node:process'

/** Load a developer-only environment file without changing CI behavior. */
export function loadLocalEnv(): void {
  try {
    loadEnvFile('.env.local')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
