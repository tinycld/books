// Paths without the org prefix; callers pass them through `useOrgHref`. Each kind's
// routes start at its `routeBase`.

import { documentKey, type KeyedDocument } from './record-key'
import type { SalesDocumentKind } from './sales-document-kinds'

type RouteKind = Pick<SalesDocumentKind, 'routeBase'>

// The kind's new-document route with only the params given. `fresh` is a nonce: a
// replace from one new form to another (Post & new) keys a fresh form on it; it comes
// before the party (`customer` or `vendor`), which Post & new keeps only when the form
// was opened with it. `estimate` starts an invoice from that estimate (Convert to invoice);
// `invoice` starts a credit memo from that invoice (Create credit memo); `sales_receipt`
// and `credit_memo` start a refund receipt from that sales receipt (Refund) or credit memo
// (Refund credit); `purchase_order` starts a bill from that purchase order (Copy to bill).
export function documentNewHref(
    kind: RouteKind,
    input: {
        customer?: string
        vendor?: string
        fresh?: string
        replaces?: string
        copy?: string
        estimate?: string
        invoice?: string
        sales_receipt?: string
        credit_memo?: string
        purchase_order?: string
    }
): string {
    const params = new URLSearchParams()
    const keys = [
        'replaces',
        'copy',
        'estimate',
        'invoice',
        'sales_receipt',
        'credit_memo',
        'purchase_order',
        'fresh',
        'customer',
        'vendor',
    ] as const
    for (const key of keys) {
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

// A stored document's path by its URL key (lib/record-key.ts).
export function documentPath(kind: RouteKind, key: string, tab: DocumentTab = 'edit'): string {
    const path = `${kind.routeBase}/${key}`
    return tab === 'pdf' ? `${path}?tab=pdf` : path
}

// A stored purchase order's form (`?edit=1`, purchase order spec §3.2): its read view's
// path with the edit param, and the tab's after it.
export function documentEditPath(kind: RouteKind, key: string, tab: DocumentTab = 'edit'): string {
    const path = `${kind.routeBase}/${key}?edit=1`
    return tab === 'pdf' ? `${path}&tab=pdf` : path
}

// A stored document's path. `doc` carries what its URL key needs: a numbered document
// that no correction replaced opens by its number, any other by its id.
export function documentHref(
    kind: RouteKind,
    doc: KeyedDocument,
    tab: DocumentTab = 'edit'
): string {
    return documentPath(kind, documentKey(doc), tab)
}

// The name of a stored document's screen in the Books stack (`estimates/[id]`): its
// route under the package's stack, which drops the `books/` of `routeBase`.
export function documentStackRouteName(kind: RouteKind): string {
    return `${kind.routeBase.replace(/^books\//, '')}/[id]`
}
