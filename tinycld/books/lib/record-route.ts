export type RecordRoute = { path: string; params?: Record<string, string> }

export type OpenRecord = { kind: 'new' } | { kind: 'id'; id: string } | { kind: 'none' }

export function recordPath(listPath: string, id: string): RecordRoute {
    return { path: `${listPath}/[id]`, params: { id } }
}

export function newRecordPath(listPath: string, params?: Record<string, string>): RecordRoute {
    const path = `${listPath}/new`
    if (!params) return { path }
    return { path, params }
}

// The record the URL opens. The child stack's route is the only record of it.
// A list path holds only letters and `/`, so it needs no escaping in the pattern.
export function openRecordFromPath(listPath: string, pathname: string): OpenRecord {
    const segment = new RegExp(`/${listPath}/([^/]+)/?$`).exec(pathname)?.[1]
    if (!segment) return { kind: 'none' }
    if (segment === 'new') return { kind: 'new' }
    return { kind: 'id', id: segment }
}

// One record at a time in the child stack: opening another replaces the open one,
// so Back always returns to the list.
export function navigationModeFor(open: OpenRecord): 'push' | 'replace' {
    return open.kind === 'none' ? 'push' : 'replace'
}

// The child stack's record screens, after its transparent `index`.
export const RECORD_DETAIL_SCREENS = ['[id]', 'new'] as const
