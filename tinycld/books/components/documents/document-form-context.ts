import { createContext, useContext } from 'react'
import type { DocumentPartyRow } from '../../hooks/document-data'
import type { useTaxRateOptions } from '../../hooks/useTaxRateOptions'
import type { SourceLinkKey } from '../../lib/document-source-links'
import type { LineAmountView } from '../../lib/document-tax'
import { INVOICE_KIND, type SalesDocumentKind } from '../../lib/sales-document-kinds'
import type { PartyFills } from './document-kinds'

// What a sales document's header fields and line cells read beyond their own value: core
// hands a host component only its value and onChange. Server data the screen already
// loaded, not UI state, so it travels with the form rather than through a store.
export type DocumentFormScope = {
    // The kind of the document: its test ids, texts and log context.
    kind: SalesDocumentKind
    // The fields a vendor pick sets (DocumentKind.partyFills); none for a kind that fills
    // nothing, and outside a document form.
    partyFills: PartyFills | undefined
    // This mounted form: which form the band store's flag names.
    bandKey: string
    currency: string
    // The party the form names now (the stored one, then each pick), read through the
    // kind's data source (DocumentDataSource.useParty).
    party: DocumentPartyRow | undefined
    isPartyLoading: boolean
    partyLoadFailed: boolean
    retryParty: () => void
    taxRows: ReturnType<typeof useTaxRateOptions>['rows']
    // The saved expiration date of an estimate that shows as Expired (expiredOnOf), for
    // the hint under Expiration date; null otherwise.
    expiredOn: string | null
    // The number of the estimate an invoice is made from ("From estimate <n>"), read by
    // the screen (estimateNumberOf), so the Customer field runs no query of its own; ''
    // when the invoice names none.
    estimateNumber: string
    // The id of that estimate: the one a new invoice is made from (or a new correction
    // keeps), else the stored invoice's; '' when it names none. While it is set the
    // customer cannot change (the server refuses it), so Customer draws as text.
    estimateId: string
    // The source link as the form holds it now (a credit memo's invoice, a refund's sales
    // receipt or credit memo): its column (`key`, '' on a kind or form with none), its id
    // ('' when it names none), its label ("For invoice <n>", "Refund of sales receipt <n>",
    // "Pays out credit memo <n>", with "(void)" on a void one; '' until the source is read),
    // the plain text the link row draws after the link (`detail`: a payout's
    // " · <money> unapplied"; absent or '' for every other link), whether Remove link is
    // offered (`canRemove`), whether the customer is locked to the source (`locksParty`, a
    // payout), and Remove link (the link row, a customer pick).
    sourceLink: {
        key: SourceLinkKey | ''
        id: string
        label: string
        detail?: string
        canRemove: boolean
        locksParty: boolean
        remove: () => void
    }
    // The definition's description of each field whose host component draws its own hint
    // (SELF_HINTED_FIELDS), by field key: the form drops it from the cell, so the component
    // reads it here. A field whose stored description is empty gets the host layout's
    // default; a field with neither has no entry.
    hints: Readonly<Record<string, string>>
    // Whether the form's first field takes the focus at mount (web only): false on a form
    // that replaced the document's read view on the same screen (DocumentScreen
    // useOpensForm).
    focusesFirstField: boolean
}

export const DocumentFormContext = createContext<DocumentFormScope | null>(null)

// The host components render only inside DocumentForm; anywhere else (a design canvas)
// they read an empty scope, with the invoice's kind.
const EMPTY_SCOPE: DocumentFormScope = {
    kind: INVOICE_KIND,
    partyFills: undefined,
    bandKey: '',
    currency: 'USD',
    party: undefined,
    isPartyLoading: false,
    partyLoadFailed: false,
    retryParty: () => {},
    taxRows: [],
    expiredOn: null,
    estimateNumber: '',
    estimateId: '',
    sourceLink: {
        key: '',
        id: '',
        label: '',
        canRemove: false,
        locksParty: false,
        remove: () => {},
    },
    hints: {},
    focusesFirstField: true,
}

export function useDocumentFormScope(): DocumentFormScope {
    return useContext(DocumentFormContext) ?? EMPTY_SCOPE
}

// The line tables as the form computes them once per change: each line's Amount cell (by
// table key, then row index), and whether core draws the rows as cards (a narrow
// container). Its own context, so a keystroke in a line re-renders the line cells and not
// the header fields.
export type DocumentLinesView = {
    amounts: Readonly<Record<string, readonly LineAmountView[]>>
    isCards: boolean
}

export const DocumentLinesContext = createContext<DocumentLinesView>({
    amounts: {},
    isCards: false,
})

export function useDocumentLinesView(): DocumentLinesView {
    return useContext(DocumentLinesContext)
}
