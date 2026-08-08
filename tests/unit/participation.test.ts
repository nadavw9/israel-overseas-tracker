import { describe, expect, it } from 'vitest'
import type { PublicParticipation } from '../../src/domain/athlete'
import { messages } from '../../src/i18n/messages'
import { participationDisplay } from '../../src/services/participation'

function circuitActivity(circuit: 'ATP' | 'WTA' | 'ITF'): PublicParticipation {
  return {
    kind: 'circuit-activity',
    activity: {
      circuit,
      discipline: 'singles',
      competition: 'Example Open',
      season: '2026',
      activityType: 'ranking',
      effectiveAt: '2026-08-01T00:00:00.000Z',
      source: {
        publisher: 'Example',
        sourceUrl: 'https://example.com/circuit',
        retrievedAt: '2026-08-03T00:00:00.000Z',
      },
    },
  }
}

describe('circuit participation display', () => {
  it.each([
    ['ATP', 'ATP / ITF international circuit', 'הסבב הבין־לאומי ATP / ITF'],
    ['ITF', 'ATP / ITF international circuit', 'הסבב הבין־לאומי ATP / ITF'],
    ['WTA', 'WTA / ITF international circuit', 'הסבב הבין־לאומי WTA / ITF'],
  ] as const)('labels %s without inventing an organization or location', (circuit, english, hebrew) => {
    const participation = circuitActivity(circuit)

    expect(participationDisplay(participation).title).toBe(english)
    expect(participationDisplay(participation, messages.he.circuitParticipation).title).toBe(hebrew)
    expect(participationDisplay(participation)).not.toHaveProperty('location')
    expect(participationDisplay(participation)).not.toHaveProperty('organization')
  })
})
