import type { SalesDocumentKind } from './sales-document-kinds'

// A quote or an order (numbered at the first save): its new title until the first save,
// then "Estimate 1001" or "Purchase order 1004" by the stored number. A posting kind: "Edit
// 1004" for a correction, new or saved; the kind's draft title once the draft is stored;
// else its new title.
export function documentFormTitle(
    kind: SalesDocumentKind,
    replacesNumber: string,
    isStored: boolean,
    number: string
): string {
    switch (kind.lifecycle) {
        case 'quote':
        case 'order':
            return isStored ? `${kind.noun} ${number}` : kind.newTitle
        case 'posting':
            if (replacesNumber) return `Edit ${replacesNumber}`
            return isStored ? kind.draftTitle : kind.newTitle
    }
}
