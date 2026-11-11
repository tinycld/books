import { createContext, useContext } from 'react'
import type { useTaxRateOptions } from '../../hooks/useTaxRateOptions'
import type { LineAmountView } from '../../lib/invoice-tax'
import type { BooksCustomers } from '../../types'

// What the invoice's header fields and line cells read beyond their own value: core
// hands a host component only its value and onChange. Server data the screen already
// loaded, not UI state, so it travels with the form rather than through a store.
export type InvoiceFormScope = {
    // This mounted form: which form the band store's flag names.
    bandKey: string
    currency: string
    // The customer the form names now (the stored one, then each pick).
    customer: BooksCustomers | undefined
    isCustomerLoading: boolean
    customerLoadFailed: boolean
    retryCustomer: () => void
    taxRows: ReturnType<typeof useTaxRateOptions>['rows']
}

export const InvoiceFormContext = createContext<InvoiceFormScope | null>(null)

// The invoice host's components render only inside InvoiceForm; anywhere else (a
// design canvas) they read an empty scope.
const EMPTY_SCOPE: InvoiceFormScope = {
    bandKey: '',
    currency: 'USD',
    customer: undefined,
    isCustomerLoading: false,
    customerLoadFailed: false,
    retryCustomer: () => {},
    taxRows: [],
}

export function useInvoiceFormScope(): InvoiceFormScope {
    return useContext(InvoiceFormContext) ?? EMPTY_SCOPE
}

// The lines table as the form computes it once per change: each line's Amount cell (by
// row index), and whether core draws the rows as cards (a narrow container). Its own
// context, so a keystroke in a line re-renders the line cells and not the header fields.
export type InvoiceLinesView = {
    amounts: readonly LineAmountView[]
    isCards: boolean
}

export const InvoiceLinesContext = createContext<InvoiceLinesView>({ amounts: [], isCards: false })

export function useInvoiceLinesView(): InvoiceLinesView {
    return useContext(InvoiceLinesContext)
}
