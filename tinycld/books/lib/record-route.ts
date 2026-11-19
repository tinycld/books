export type RecordRoute = { path: string; params?: Record<string, string> }

export type OpenRecord = { kind: 'new' } | { kind: 'id'; id: string } | { kind: 'none' }

// `params` (the page's `tab`) follow the id in the route's search params.
export function recordPath(
    listPath: string,
    id: string,
    params?: Record<string, string>
): RecordRoute {
    return { path: `${listPath}/[id]`, params: { id, ...params } }
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

// `href` (a path under the org, with an optional `?query`) is a record of the kind's own
// child stack: `<listPath>/<id>` or `<listPath>/new`.
export function isKindStackHref(listPath: string, href: string): boolean {
    const path = href.split('?')[0] ?? href
    return path.startsWith(`${listPath}/`)
}

// How a screen of a kind's list opens `href`. A record of the kind's own stack follows
// `navigationModeFor`. Any other route (Pay Bills, which is a screen of the Books root
// stack) is pushed over the kind route: a replace from the child stack would replace the
// whole kind route, and its list would be gone.
export function targetModeFor(
    open: OpenRecord,
    listPath: string,
    href: string
): 'push' | 'replace' {
    if (!isKindStackHref(listPath, href)) return 'push'
    return navigationModeFor(open)
}

// The child stack's record screens, after its transparent `index`.
export const RECORD_DETAIL_SCREENS = ['[id]', 'new'] as const
