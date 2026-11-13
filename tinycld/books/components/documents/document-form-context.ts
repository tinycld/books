import { createContext, useContext } from 'react'
import type { useTaxRateOptions } from '../../hooks/useTaxRateOptions'
import type { LineAmountView } from '../../lib/document-tax'
import { INVOICE_KIND, type SalesDocumentKind } from '../../lib/sales-document-kinds'
import type { BooksCustomers } from '../../types'

// What a sales document's header fields and line cells read beyond their own value: core
// hands a host component only its value and onChange. Server data the screen already
// loaded, not UI state, so it travels with the form rather than through a store.
export type DocumentFormScope = {
    // The kind of the document: its test ids, texts and log context.
    kind: SalesDocumentKind
    // This mounted form: which form the band store's flag names.
    bandKey: string
    currency: string
    // The customer the form names now (the stored one, then each pick).
    customer: BooksCustomers | undefined
    isCustomerLoading: boolean
    customerLoadFailed: boolean
    retryCustomer: () => void
    taxRows: ReturnType<typeof useTaxRateOptions>['rows']
    // The saved expiration date of an estimate that shows as Expired (expiredOnOf), for
    // the hint under Expiration date; null otherwise.
    expiredOn: string | null
}

export const DocumentFormContext = createContext<DocumentFormScope | null>(null)

// The host components render only inside DocumentForm; anywhere else (a design canvas)
// they read an empty scope, with the invoice's kind.
const EMPTY_SCOPE: DocumentFormScope = {
    kind: INVOICE_KIND,
    bandKey: '',
    currency: 'USD',
    customer: undefined,
    isCustomerLoading: false,
    customerLoadFailed: false,
    retryCustomer: () => {},
    taxRows: [],
    expiredOn: null,
}

export function useDocumentFormScope(): DocumentFormScope {
    return useContext(DocumentFormContext) ?? EMPTY_SCOPE
}

// The lines table as the form computes it once per change: each line's Amount cell (by
// row index), and whether core draws the rows as cards (a narrow container). Its own
// context, so a keystroke in a line re-renders the line cells and not the header fields.
export type DocumentLinesView = {
    amounts: readonly LineAmountView[]
    isCards: boolean
}

export const DocumentLinesContext = createContext<DocumentLinesView>({
    amounts: [],
    isCards: false,
})

export function useDocumentLinesView(): DocumentLinesView {
    return useContext(DocumentLinesContext)
}
