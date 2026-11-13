// Paths without the org prefix; callers pass them through `useOrgHref`. Each kind's
// routes start at its `routeBase`.

import type { SalesDocumentKind } from './sales-document-kinds'

type RouteKind = Pick<SalesDocumentKind, 'routeBase'>

// The kind's new-document route with only the params given. `fresh` is a nonce: a
// replace from one new form to another (Post & new) keys a fresh form on it; it comes
// before `customer`, which Post & new keeps only when the form was opened with it.
// `estimate` starts an invoice from that estimate (Convert to invoice).
export function documentNewHref(
    kind: RouteKind,
    input: {
        customer?: string
        fresh?: string
        replaces?: string
        copy?: string
        estimate?: string
    }
): string {
    const params = new URLSearchParams()
    for (const key of ['replaces', 'copy', 'estimate', 'fresh', 'customer'] as const) {
        const value = input[key]
        if (value) params.set(key, value)
    }
    const query = params.toString()
    const path = `${kind.routeBase}/new`
    return query === '' ? path : `${path}?${query}`
}

// The tabs under a document's title: the form or its details (`edit`), and the PDF
// view. The `tab` search param holds it; the first tab has none.
export type DocumentTab = 'edit' | 'pdf'

export function documentTabOf(param: string | undefined): DocumentTab {
    return param === 'pdf' ? 'pdf' : 'edit'
}

export function documentHref(kind: RouteKind, id: string, tab: DocumentTab = 'edit'): string {
    const path = `${kind.routeBase}/${id}`
    return tab === 'pdf' ? `${path}?tab=pdf` : path
}

// The name of a stored document's screen in the Books stack (`estimates/[id]`): its
// route under the package's stack, which drops the `books/` of `routeBase`.
export function documentStackRouteName(kind: RouteKind): string {
    return `${kind.routeBase.replace(/^books\//, '')}/[id]`
}
