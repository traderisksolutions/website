import { beforeAll, afterAll } from 'vitest'
import '@testing-library/jest-dom'

// Silence expected React console.error noise in tests (act() warnings, etc.)
const _consoleError = console.error.bind(console)
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const msg = String(args[0])
    if (msg.includes('Warning:') || msg.includes('ReactDOM.render')) return
    _consoleError(...args)
  }
})
afterAll(() => { console.error = _consoleError })
