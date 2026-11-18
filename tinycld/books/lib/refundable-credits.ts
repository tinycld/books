// The vendor refund form's credits list (vendor refund spec §3.4): the vendor's posted
// vendor credits with an unapplied balance, merged with the credits a stored refund's lines
// name, each once, oldest credit date first, then number.

import type { BooksVendorCredits } from '../types'
import type { OutstandingRow } from './payment-allocation'

// A vendor credit as the list reads it (the query's `.select()`).
export type RefundableCredit = Pick<
    BooksVendorCredits,
    'id' | 'number' | 'date' | 'total' | 'balance' | 'ref_no'
>

// A stored refund line with its credit. `isPosted`: the line is a posted refund's (the
// original of a correction), so the credit's balance has already lost its amount; a
// draft's line has not lowered the balance.
export type RefundableStored = {
    credit: RefundableCredit
    amount: number
    isPosted: boolean
}

// A stored line with the vendor of the refund it belongs to: the list names it only while
// that vendor is the form's.
export type RefundStoredLine = RefundableStored & { vendor: string }

const byNumber = new Intl.Collator('en', { numeric: true })

function listOrder(a: OutstandingRow, b: OutstandingRow): number {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    return byNumber.compare(a.number, b.number)
}

type StoredSums = { credit: RefundableCredit; posted: number; draft: number; hasPosted: boolean }

function storedSums(stored: readonly RefundableStored[]): Map<string, StoredSums> {
    const sums = new Map<string, StoredSums>()
    for (const line of stored) {
        const sum = sums.get(line.credit.id) ?? {
            credit: line.credit,
            posted: 0,
            draft: 0,
            hasPosted: false,
        }
        if (line.isPosted) {
            sum.posted += line.amount
            sum.hasPosted = true
        } else {
            sum.draft += line.amount
        }
        sums.set(line.credit.id, sum)
    }
    return sums
}

// A credit's unapplied amount as the form may refund it: the balance, plus what a posted
// original refunded from it (released when the correction posts). A draft's credit that
// is no longer open is listed for its own line.
function openOf(credit: RefundableCredit, isOpen: boolean, sum: StoredSums | undefined): number {
    if (sum === undefined) return credit.balance
    if (sum.hasPosted) return credit.balance + sum.posted
    return isOpen ? credit.balance : sum.draft
}

/**
 * The open credits, then the credits the stored lines name that the open set no longer
 * holds, each once, as the shared list's rows: `date` and `due_date` are the credit date
 * (a credit falls due on no day; the list sorts and shows by its date), `ref` the vendor's
 * credit no. Oldest credit date first, then number.
 */
export function mergeRefundable(
    open: readonly RefundableCredit[],
    stored: readonly RefundableStored[]
): OutstandingRow[] {
    const sums = storedSums(stored)
    const openIds = new Set(open.map(credit => credit.id))
    const credits = [
        ...open,
        ...[...sums.values()].filter(sum => !openIds.has(sum.credit.id)).map(sum => sum.credit),
    ]
    return credits
        .map(credit => {
            const date = credit.date.slice(0, 10)
            return {
                id: credit.id,
                number: credit.number,
                date,
                due_date: date,
                total: credit.total,
                open: openOf(credit, openIds.has(credit.id), sums.get(credit.id)),
                ref: credit.ref_no,
            }
        })
        .sort(listOrder)
}

// A refund record's lines (`PaymentRecordView['lines']`) as the list's stored lines.
export function refundStoredLines(
    lines: readonly {
        document: string
        amount: number
        number: string
        date: string
        total: number
        open: number
        ref: string
    }[],
    vendor: string,
    isPosted: boolean
): RefundStoredLine[] {
    return lines.map(line => ({
        credit: {
            id: line.document,
            number: line.number,
            date: line.date,
            total: line.total,
            balance: line.open,
            ref_no: line.ref,
        },
        amount: line.amount,
        isPosted,
        vendor,
    }))
}

// Each stored line's credit's unapplied amount as the list will show it (mergeRefundable's
// rule, with a credit counted open while its stored balance is above zero), so a draft's or
// a correction's start entries carry the same `open` as their rows.
export function storedOpenOf(stored: readonly RefundableStored[]): Record<string, number> {
    const open = new Map<string, RefundableCredit>()
    for (const line of stored) {
        if (line.credit.balance > 0) open.set(line.credit.id, line.credit)
    }
    const rows = mergeRefundable([...open.values()], stored)
    return Object.fromEntries(rows.map(row => [row.id, row.open]))
}

// Each listed credit's date by id, for the schema's row-date rule.
export function creditDatesOf(rows: readonly OutstandingRow[]): Record<string, string> {
    return Object.fromEntries(rows.map(row => [row.id, row.date]))
}
