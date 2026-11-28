import type { BooksStockMoves } from '../types'
import { DOCUMENT_SCREENS } from './document-screens'
import { DOC_TYPE_LABELS } from './register'

// The document a stock move or a Books-made adjustment came from, by its source collection
// and id (inventory-adjust spec §3.5, §3.6): its kind's word and its route.

const SCREENS = new Map<string, string>(Object.entries(DOCUMENT_SCREENS))

// `books_sales_receipts` is the doc type `sales_receipt`.
function docTypeOf(source: string): string {
    return source.replace(/^books_/, '').replace(/s$/, '')
}

// "Bill", "Sales receipt", "Inventory adjustment"; '' for a source that is no document kind.
export function stockSourceWord(source: string): string {
    const docType = docTypeOf(source)
    return Object.hasOwn(DOC_TYPE_LABELS, docType) ? DOC_TYPE_LABELS[docType] : ''
}

// The Transaction cell of a move: "Invoice 1042", "Inventory adjustment 12"; the word
// alone when the document has no number; "Opening stock" for an item's opening move.
export function moveTransactionText(
    move: Pick<BooksStockMoves, 'kind' | 'source' | 'document_number'>
): string {
    if (move.kind === 'opening') return 'Opening stock'
    const word = stockSourceWord(move.source)
    return move.document_number ? `${word} ${move.document_number}` : word
}

// `books/bills`: the route base of the source's document screen (the `routeBase` that
// useOpenDocument reads); null for a collection no document screen shows.
export function stockSourceRouteBase(source: string): string | null {
    const screen = SCREENS.get(source)
    if (!screen) return null
    return `books/${screen.replace(/\/\[id\]$/, '')}`
}

// `books/bills/<id>`, without the org prefix; null for a collection no document screen shows.
export function stockSourcePath(source: string, document: string): string | null {
    const routeBase = stockSourceRouteBase(source)
    if (!routeBase || !document) return null
    return `${routeBase}/${document}`
}
