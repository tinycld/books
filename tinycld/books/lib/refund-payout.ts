// A payout's two rules (refund receipt spec §3.3): its total is at most the credit memo's
// unapplied credit, and it is dated on or after the memo's date. The server refuses the
// same refund with the same field and words (server/refund_receipt_payout.go
// `refundPayoutRefusal`); both run server/testdata/refund_payout_cases.json. Pure.

import type { TableRow } from '@tinycld/core/lib/forms/values'
import type { z } from '@tinycld/core/ui/form'
import { type DocumentTax, documentTotals } from './document-lines'
import { REFUND_RECEIPT_MESSAGES } from './document-texts'
import { documentLinesOf } from './document-values'
import { textOf } from './form-values'
import { formatMoney } from './money'
import { formatDay } from './register-range'

// What a payout is checked against: the memo's unapplied credit in cents (its live
// `balance`; for a correction, plus what the original pays out), its number and date, and
// the Books currency.
export type PayoutLimits = {
    unapplied: number
    memoNumber: string
    memoDate: string
    currency: string
}

export type PayoutRefusal = { field: 'credit_memo' | 'date'; message: string } | null

// A payout form's limits: the memo its link names (`memo`, read live) with its unapplied
// credit, plus `replacedPayout` (what the posted payout a correction replaces pays out; the
// server gives it back before it checks the cap). Null for a form that pays out no memo,
// while the memo is not read, or for a memo that is no longer posted: the server then
// refuses the link itself ("Choose a posted credit memo …").
export function payoutLimitsOf(
    link: { key: string; id: string },
    memo: { id: string; number: string; status: string; balance: number; date: string } | undefined,
    replacedPayout: number,
    currency: string
): PayoutLimits | null {
    if (link.key !== 'credit_memo' || link.id === '' || memo?.id !== link.id) return null
    if (memo.status !== 'posted') return null
    return {
        unapplied: memo.balance + replacedPayout,
        memoNumber: memo.number,
        memoDate: memo.date.slice(0, 10),
        currency,
    }
}

// "The refund is more than the unapplied credit of $250.00 on credit memo 1001."
function capMessage(limits: PayoutLimits): string {
    return REFUND_RECEIPT_MESSAGES.payoutAboveCredit
        .replace('%s', formatMoney(limits.unapplied, limits.currency))
        .replace('%s', limits.memoNumber)
}

// "Date the refund on or after the credit memo's date, Nov 12, 2026."
function dateMessage(limits: PayoutLimits): string {
    return REFUND_RECEIPT_MESSAGES.payoutBeforeCredit.replace('%s', formatDay(limits.memoDate))
}

// The first rule a payout breaks, as the server checks them: the cap first, then the date;
// null when it breaks neither. Days are ISO (YYYY-MM-DD), so they compare as text.
export function payoutRefusal(
    input: PayoutLimits & { total: number; refundDate: string }
): PayoutRefusal {
    if (input.total > input.unapplied) return { field: 'credit_memo', message: capMessage(input) }
    if (input.refundDate < input.memoDate) return { field: 'date', message: dateMessage(input) }
    return null
}

// A payout's void dialog says its credit memo's credit is unapplied again (refund receipt
// spec §3.8): the body for a refund that names `creditMemo`; undefined for a refund with
// no credit memo, which shows the dialog's own text. The read view's Void uses it.
export function payoutVoidBodyOf(creditMemo: string): string | undefined {
    if (creditMemo === '') return undefined
    return REFUND_RECEIPT_MESSAGES.payoutVoidBody
}

// The form's total of the payout's lines with the header tax. Null when it cannot be
// counted (half-typed or too-large cells): the layer's own total rules show those.
function payoutTotalOf(values: Record<string, unknown>, tax: DocumentTax): number | null {
    const rows = Array.isArray(values.lines) ? (values.lines as TableRow[]) : []
    const totals = documentTotals(documentLinesOf(rows), tax)
    if (totals.isTooLarge || !Number.isFinite(totals.total)) return null
    return totals.total
}

// The kind's `.superRefine` for a payout: the cap on `credit_memo` (the link row draws it)
// and the date rule on `date` (under Refund date). The form shows each rule the values
// break, where the server answers the first. `limits` is null for a refund that pays out
// no credit memo, which adds no issue. `tax` is the header tax the values name (none by
// default: the lines' own amounts).
export function refundPayoutRule(limits: PayoutLimits | null, tax: DocumentTax = null) {
    return (values: Record<string, unknown>, ctx: z.RefinementCtx) => {
        if (!limits) return
        const total = payoutTotalOf(values, tax)
        if (total !== null && total > limits.unapplied) {
            ctx.addIssue({ code: 'custom', path: ['credit_memo'], message: capMessage(limits) })
        }
        const refundDate = textOf(values.date).slice(0, 10)
        if (refundDate !== '' && refundDate < limits.memoDate) {
            ctx.addIssue({ code: 'custom', path: ['date'], message: dateMessage(limits) })
        }
    }
}
