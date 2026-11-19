// The source link of a sales document: the document a new one is made from and keeps a
// link to (a credit memo's invoice; a refund receipt's sales receipt, or the credit memo
// it pays out). One kind-driven link in the layer: the form holds it in its scope
// (`sourceLink`), the save writes the column its key names, and the screen reads the
// source through `linkSource`. Pure: no React Native import.

import type { InvoiceSource } from '../hooks/document-data'
import type { BooksCreditMemos, BooksSalesReceipts } from '../types'
import { invoiceLinkLabel } from './credit-memo-link'
import { formatMoney } from './money'

// The column a link is stored in, which is also its route param (`?invoice`,
// `?sales_receipt`, `?credit_memo`).
export type SourceLinkKey = 'invoice' | 'sales_receipt' | 'credit_memo'

// The source a new form is made from (or a new correction keeps), as its own row.
export type LinkSource =
    | { key: 'invoice'; row: InvoiceSource }
    | { key: 'sales_receipt'; row: BooksSalesReceipts }
    | { key: 'credit_memo'; row: BooksCreditMemos }

// The link a form holds: its key ('' when the form names no source) and the source's id
// ('' when none, or once removed).
export type HeldSourceLink = { key: SourceLinkKey | ''; id: string }

export const NO_SOURCE_LINK: HeldSourceLink = { key: '', id: '' }

// The link named by a document's values (a new form's start values, or a stored record's
// columns): the first of the kind's link keys that holds an id. A kind with no link keys,
// or values that name none, hold no link.
export function sourceLinkOf(
    keys: readonly SourceLinkKey[],
    values: Readonly<Record<string, unknown>> | undefined
): HeldSourceLink {
    if (!values) return NO_SOURCE_LINK
    for (const key of keys) {
        const id = values[key]
        if (typeof id === 'string' && id !== '') return { key, id }
    }
    return NO_SOURCE_LINK
}

// The source a new form's route names (`?credit_memo`, `?sales_receipt`, `?invoice`), as
// the link it starts with; NO_SOURCE_LINK when it names none. The route passes one at most;
// the order only makes the answer one.
export function sourceParamOf(input: {
    invoice?: string
    salesReceipt?: string
    creditMemo?: string
}): HeldSourceLink {
    if (input.creditMemo) return { key: 'credit_memo', id: input.creditMemo }
    if (input.salesReceipt) return { key: 'sales_receipt', id: input.salesReceipt }
    if (input.invoice) return { key: 'invoice', id: input.invoice }
    return NO_SOURCE_LINK
}

// What a held link allows (refund receipt spec §3.3): a payout (`credit_memo`) cannot turn
// into a refund against income, so it has no Remove link and its customer cannot change;
// every other link can be removed, and a customer pick removes it. No link allows nothing.
export function sourceLinkRules(link: HeldSourceLink): { canRemove: boolean; locksParty: boolean } {
    if (link.key === '') return { canRemove: false, locksParty: false }
    const isPayout = link.key === 'credit_memo'
    return { canRemove: !isPayout, locksParty: isPayout }
}

// The words of a refund receipt's link (spec §3.2, §3.3, §3.8): "Refund of sales receipt
// 1004" or "Pays out credit memo 1001", with " (void)" once the source is void (the link
// stays).
export function refundSourceLabel(source: {
    key: 'sales_receipt' | 'credit_memo'
    number: string
    status: string
}): string {
    const label =
        source.key === 'sales_receipt'
            ? `Refund of sales receipt ${source.number}`
            : `Pays out credit memo ${source.number}`
    return source.status === 'void' ? `${label} (void)` : label
}

// The plain text a payout's link row draws right after the link (spec §3.3): the credit
// the memo still holds, " · $250.00 unapplied", in the money the totals show. The leading
// space is in the text, so the row reads "Pays out credit memo 1001 · $250.00 unapplied".
export function payoutUnappliedText(unapplied: number, currency: string): string {
    return ` · ${formatMoney(unapplied, currency)} unapplied`
}

// The link row's words for a source the screen read: an invoice's "For invoice 1004", a
// sales receipt's or a credit memo's refundSourceLabel.
export function linkSourceLabel(source: LinkSource): string {
    if (source.key === 'invoice') return invoiceLinkLabel(source.row)
    const { number, status } = source.row
    return refundSourceLabel({ key: source.key, number, status })
}
