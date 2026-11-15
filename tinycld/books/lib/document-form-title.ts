import type { SalesDocumentKind } from './sales-document-kinds'

// A quote: its new title until the first save, then "Estimate 1001" by the
// stored number. A posting kind: "Edit 1004" for a correction, new or saved; the kind's
// draft title once the draft is stored; else its new title.
export function documentFormTitle(
    kind: SalesDocumentKind,
    replacesNumber: string,
    isStored: boolean,
    number: string
): string {
    if (kind.lifecycle === 'quote') return isStored ? `${kind.noun} ${number}` : kind.newTitle
    if (replacesNumber) return `Edit ${replacesNumber}`
    return isStored ? kind.draftTitle : kind.newTitle
}
