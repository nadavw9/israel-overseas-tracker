import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App shell', () => {
  it('introduces the verified Israel overseas tracker', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: /Israel Overseas/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/verified data/i)).toBeInTheDocument()
  })
})
