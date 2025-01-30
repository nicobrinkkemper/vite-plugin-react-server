import { describe, it, expect } from 'vitest'
import { getCondition } from '../../src/plugin.js'

describe('getCondition', () => {
  it('returns "server" when react-server condition is set', () => {
    const condition = getCondition({
      env: { NODE_OPTIONS: '--conditions=react-server' }
    })
    expect(condition).toBe('server')
  })

  it('returns "client" when react-server condition is not set', () => {
    const condition = getCondition({
      env: { NODE_OPTIONS: '' }
    })
    expect(condition).toBe('client')
  })

  it('returns "client" when NODE_OPTIONS is undefined', () => {
    const condition = getCondition({
      env: {}
    })
    expect(condition).toBe('client')
  })
}) 