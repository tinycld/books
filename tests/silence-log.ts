import { log } from '@tinycld/core/lib/logger'
import { afterAll, afterEach, vi } from 'vitest'

// Refusal-path tests provoke log.error/log.warn on purpose. Call this at the top of the file: the
// spies swallow the output, reset after each test and are restored after the file, and a test can
// assert that the refusal was logged under the expected context.
export function silenceLog() {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {})
    afterEach(() => {
        error.mockClear()
        warn.mockClear()
    })
    afterAll(() => {
        error.mockRestore()
        warn.mockRestore()
    })
    return { error, warn }
}

// Third-party libraries report some expected states straight to the console.
export function silenceConsole(method: 'error' | 'warn') {
    const spy = vi.spyOn(console, method).mockImplementation(() => {})
    afterEach(() => spy.mockClear())
    afterAll(() => spy.mockRestore())
    return spy
}
