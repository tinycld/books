// The texts of the Pay Bills screen (spec §3.2–§3.5), its big figure, and where a Pay goes
// after it. Pure.

import { formatMoney, TOO_LARGE_TEXT } from './money'
import { moneyInputCents } from './money-input'
import { isWellFormedMoney, maxStoredAmount } from './money-text'
import type { Payments } from './payment-allocation'
import { PAYMENT_MESSAGES } from './payment-texts'

export const PAY_BILLS_MESSAGES = {
    title: 'Pay bills',
    // The form's rules (lib/pay-bills-schema.ts), each the Books wording of the same rule.
    paidFromRequired: 'Choose the account you paid from',
    dateInvalid: PAYMENT_MESSAGES.dateInvalid,
    methodRequired: 'Choose a payment method',
    checkDigits: 'Use digits only, up to 9.',
    checkNoTooLong: 'Check no. can be at most 40 characters',
    selectOne: 'Select at least one bill to pay.',
    totalTooLarge: 'The total is more than Books can store',

    // The list.
    noOpenBills: 'No open bills. Bills you post show here until they are paid.',
    filterEmpty: 'No open bills match these filters.',

    // The screen's states.
    loadFailed: 'Books could not load the open bills.',
    paymentLoadFailed: 'Books could not load this bill payment.',
    noAccess: 'You need bookkeeper access to pay bills',
    notFound: 'This bill payment does not exist',
    cannotEdit: 'This bill payment cannot be edited',
    discard: 'Discard this payment? The bills stay open.',
} as const

function plural(count: number, one: string, many: string): string {
    return count === 1 ? one : many
}

// "Posted Bill payment 1004"; "Posted 3 bill payments (1004–1006)" for numbers in order.
export function postedToastText(numbers: readonly string[]): string {
    if (numbers.length === 1) return `Posted Bill payment ${numbers[0]}`
    const first = numbers[0] ?? ''
    const last = numbers[numbers.length - 1] ?? ''
    return `Posted ${numbers.length} bill payments (${first}–${last})`
}

// "3 bills selected · 2 vendors"; "No bills selected".
export function selectedText(count: number, vendors: number): string {
    if (count === 0) return 'No bills selected'
    const bills = plural(count, 'bill', 'bills')
    const vendorWord = plural(vendors, 'vendor', 'vendors')
    return `${count} ${bills} selected · ${vendors} ${vendorWord}`
}

// "2 selected bills are hidden by the filter".
export function hiddenText(count: number): string {
    if (count === 1) return '1 selected bill is hidden by the filter'
    return `${count} selected bills are hidden by the filter`
}

// "4 open bills" (the shown rows). A correction lists its vendor's open bills and the
// bills it paid, so its count reads the same.
export function openCountText(count: number, _mode: 'new' | 'replaces'): string {
    return `${count} open ${plural(count, 'bill', 'bills')}`
}

const NO_AMOUNT = '—'

/**
 * The header's big figure, "Total payment": the sum of the row payments as money; a dash
 * while a row amount does not parse; "Too large" for a well-formed row, or a sum, above
 * what Books can store.
 */
export function totalFigureText(payments: Payments, currency: string): string {
    let total = 0
    let isTooLarge = false
    for (const entry of Object.values(payments)) {
        const cents = moneyInputCents(entry.amount, currency)
        if (cents !== null) {
            total += cents
            continue
        }
        if (!isWellFormedMoney(entry.amount, currency)) return NO_AMOUNT
        isTooLarge = true
    }
    if (isTooLarge || total > maxStoredAmount) return TOO_LARGE_TEXT
    return formatMoney(total, currency)
}

export type AfterPayTarget = { kind: 'back' } | { kind: 'replace'; href: string }

// After Pay: back to the screen below; with none (a reload, a link), the first payment's
// read view.
export function afterPayTarget(canGoBack: boolean, firstId: string): AfterPayTarget {
    if (canGoBack) return { kind: 'back' }
    return { kind: 'replace', href: `books/bill-payments/${firstId}` }
}
