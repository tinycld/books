import { log } from '@tinycld/core/lib/logger'
import { afterAll, afterEach, onTestFinished, vi } from 'vitest'

// Refusal-path tests provoke log.error/log.warn on purpose. Call this at the top of the file: the
// spies swallow the output, reset after each test and are restored after the file, and a test can
// assert that the refusal was logged under the expected context.
export function silenceLog() {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {})
    // info is only observed, not swallowed, so files that log info on purpose print as before.
    const info = vi.spyOn(log, 'info')
    afterEach(() => {
        error.mockClear()
        warn.mockClear()
        info.mockClear()
    })
    afterAll(() => {
        error.mockRestore()
        warn.mockRestore()
        info.mockRestore()
    })
    return { error, warn, info }
}

// The exact line TanStack DB prints to console.error when a live query's source collection fails.
const SOURCE_ERROR_LINE = /^\[Live Query Error\] Source collection '([^']+)' entered error state$/

function failedSourceId(args: unknown[]): string | null {
    const [line] = args
    if (args.length !== 1 || typeof line !== 'string') return null
    return SOURCE_ERROR_LINE.exec(line)?.[1] ?? null
}

// A test that makes source collections fail on purpose calls this with their ids, after the seed
// creates them. Only TanStack DB's report of those sources failing is dropped. A report that
// names any other source still prints and fails the test, as does a listed source that never
// reported, so a test cannot hide a failure it did not cause. The spy is restored when the test ends.
export function expectLiveQueryError(...sourceIds: string[]) {
    if (sourceIds.length === 0) {
        throw new Error('expectLiveQueryError needs the id of each source that fails on purpose.')
    }
    const print = console.error
    const reported = new Set<string>()
    const unexpected: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        const id = failedSourceId(args)
        if (id !== null && sourceIds.includes(id)) {
            reported.add(id)
            return
        }
        if (id !== null) unexpected.push(id)
        print(...args)
    })
    onTestFinished(() => {
        spy.mockRestore()
        if (unexpected.length > 0) {
            throw new Error(`An unexpected live query source failed: ${unexpected.join(', ')}`)
        }
        const silent = sourceIds.filter(id => !reported.has(id))
        if (silent.length > 0) {
            throw new Error(`No live query source error was reported for: ${silent.join(', ')}`)
        }
    })
}
