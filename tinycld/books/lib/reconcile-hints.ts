// The hint line's hints (reconcile spec §3 "Hint line"): pure, over the lines query's rows
// and the totals the work screen already computed from them. All money is integer cents.
import type { BooksReconcileLines } from '../types'
import { centsToText, formatMoney } from './money'
import { lineTypeNumber, type ReconcileTotals } from './reconcile'
import { formatDay } from './register-range'

export type ReconcileHintId = 'review' | 'one' | 'one-cleared' | 'wrong-side' | 'digits'

export type ReconcileHintAction = {
    label: string
    kind: 'banking' | 'show-row' | 'show-amount'
    lineId?: string
    // The amount text the search gets ("250.00").
    amount?: string
}

export type ReconcileHint = {
    id: ReconcileHintId
    text: string
    action?: ReconcileHintAction
}

export type ReconcileHintContext = {
    accountType: string
    statementDate: string
    currency: string
    // The account's bank connection; '' when it has none.
    connectionId: string
}

type HintLine = Pick<
    BooksReconcileLines,
    'id' | 'debit' | 'credit' | 'origin' | 'doc_type' | 'number'
> & { isCleared: boolean }

const SHOW = 'Show'
// The swapped-digits example of the spec, in the reconciliation's currency.
const EXAMPLE_RIGHT = 5_400
const EXAMPLE_WRONG = 4_500

// What clearing the line adds to the cleared balance, by the sign rule of reconcileTotals:
// a bank deposit and a card charge raise the balance, a bank payment and a card payment
// lower it. A line is on one side only.
function clearingEffect(line: HintLine, accountType: string): number {
    const outSign = accountType === 'credit_card' ? 1 : -1
    if (line.credit > 0) return outSign * line.credit
    return -outSign * line.debit
}

function lineAmount(line: HintLine): number {
    return line.credit > 0 ? line.credit : line.debit
}

// "money out was not entered as money in" for a bank payment; a card names its charges
// and payments.
function wrongSideCheck(line: HintLine, accountType: string): string {
    const isOut = line.credit > 0
    if (accountType === 'credit_card') {
        return isOut
            ? 'Check that a charge was not entered as a payment.'
            : 'Check that a payment was not entered as a charge.'
    }
    return isOut
        ? 'Check that money out was not entered as money in.'
        : 'Check that money in was not entered as money out.'
}

function reviewHint(count: number, context: ReconcileHintContext): ReconcileHint | null {
    if (count <= 0) return null
    const day = formatDay(context.statementDate)
    const subject = count === 1 ? '1 bank transaction' : `${count} bank transactions`
    const verb = count === 1 ? 'is' : 'are'
    return {
        id: 'review',
        text: `${subject} up to ${day} ${verb} still in For review. Review them first.`,
        action: { label: 'Open Banking', kind: 'banking' },
    }
}

// Lines that are not cleared whose clearing makes the difference zero.
function oneHint(
    open: readonly HintLine[],
    difference: number,
    context: ReconcileHintContext
): ReconcileHint | null {
    const [first, ...others] = open
    if (!first) return null
    const money = formatMoney(lineAmount(first), context.currency)
    if (others.length === 0) {
        return {
            id: 'one',
            text: `Clearing ${lineTypeNumber(first)} (${money}) makes the difference zero.`,
            action: { label: SHOW, kind: 'show-row', lineId: first.id },
        }
    }
    const amount = centsToText(Math.abs(difference))
    return {
        id: 'one',
        text: `${open.length} transactions of ${money} are not cleared. Clearing one makes the difference zero.`,
        action: { label: SHOW, kind: 'show-amount', amount },
    }
}

function oneClearedHint(line: HintLine | undefined, currency: string): ReconcileHint | null {
    if (!line) return null
    const money = formatMoney(lineAmount(line), currency)
    return {
        id: 'one-cleared',
        text: `Without ${lineTypeNumber(line)} (${money}) the difference is zero. Check that it is on the statement.`,
        action: { label: SHOW, kind: 'show-row', lineId: line.id },
    }
}

function wrongSideHint(line: HintLine | undefined, context: ReconcileHintContext) {
    if (!line) return null
    const money = formatMoney(lineAmount(line), context.currency)
    const check = wrongSideCheck(line, context.accountType)
    const hint: ReconcileHint = {
        id: 'wrong-side',
        text: `${lineTypeNumber(line)} (${money}) is half the difference. ${check}`,
    }
    return hint
}

function digitsHint(difference: number, currency: string): ReconcileHint | null {
    if (difference % 9 !== 0) return null
    const money = formatMoney(Math.abs(difference), currency)
    const right = formatMoney(EXAMPLE_RIGHT, currency)
    const wrong = formatMoney(EXAMPLE_WRONG, currency)
    return {
        id: 'digits',
        text: `The difference, ${money}, divides by 9. Two digits of an amount may be swapped, for example ${right} entered as ${wrong}.`,
    }
}

/**
 * The hints of a difference that is not $0.00, in the spec's order: For review bank
 * transactions up to the statement date (`reviewCount`, the screen's
 * `books.reconcile.review` read), one transaction that is not cleared whose clearing makes
 * the difference zero (or several of that amount), one cleared transaction without which
 * it is zero (the first in the rows' order), a cleared transaction of half the difference
 * on the side that fits (entered on the wrong side; the first), and a difference that
 * divides by 9 (swapped digits). A difference of 0 has no hint. One pass over the rows.
 */
export function reconcileHints(
    rows: readonly HintLine[],
    totals: Pick<ReconcileTotals, 'difference'>,
    reviewCount: number,
    context: ReconcileHintContext
): ReconcileHint[] {
    const { difference } = totals
    if (difference === 0) return []
    const closing: HintLine[] = []
    let withoutLine: HintLine | undefined
    let halfLine: HintLine | undefined
    for (const row of rows) {
        const effect = clearingEffect(row, context.accountType)
        if (!row.isCleared) {
            if (effect === difference) closing.push(row)
            continue
        }
        // Without the row the cleared balance loses `effect`; on the other side it loses
        // twice that.
        if (withoutLine === undefined && effect === -difference) withoutLine = row
        if (halfLine === undefined && 2 * effect === -difference) halfLine = row
    }
    const hints = [
        reviewHint(reviewCount, context),
        oneHint(closing, difference, context),
        oneClearedHint(withoutLine, context.currency),
        wrongSideHint(halfLine, context),
        digitsHint(difference, context.currency),
    ]
    return hints.filter(hint => hint !== null)
}
