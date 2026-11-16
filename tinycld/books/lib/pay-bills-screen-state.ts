// Which surface Pay Bills shows (spec §3.3 Empty, §3.5 Writers only and States). Pure.

import { type LiveRecovery, mergeRecoveries } from './live-recovery'
import { PAY_BILLS_MESSAGES } from './pay-bills-texts'

export type PayBillsList = 'rows' | 'empty' | 'filtered-empty'

export type PayBillsScreenState =
    | { kind: 'loading' }
    | { kind: 'error'; message: string; recovery: LiveRecovery }
    | { kind: 'no-access' | 'not-found' | 'cannot-edit'; message: string }
    // `paidFromEmpty`: the chart has no bank or credit card account, so Paid from shows
    // PAID_FROM_EMPTY_TEXT.
    | { kind: 'ready'; list: PayBillsList; paidFromEmpty: boolean }

type PayBillsRead = { isReady: boolean; isError: boolean; recovery: LiveRecovery }

export type PayBillsScreenInput = {
    canWrite: boolean
    // Every read the screen waits on (open bills, vendors, accounts with balances, the
    // settings and, on `?replaces`, the payment).
    reads: readonly PayBillsRead[]
    // `?replaces`: null without it; else the payment's status, null when no row has the id.
    replaces: null | { status: 'posted' | 'void' | null }
    // Every open bill listed, and the rows the filters keep.
    rowCount: number
    shownCount: number
    paidFromOptionCount: number
}

/**
 * A non-writer gets the no-access state before anything loads; then a failed read the
 * error with one recovery over every failed read; then loading; then a `?replaces` payment
 * that does not exist or is not posted; else the form, whose list is the rows, the empty
 * state (no open bill at all) or the filtered-empty state (the filters hide every bill).
 */
export function payBillsScreenState(input: PayBillsScreenInput): PayBillsScreenState {
    if (!input.canWrite) return { kind: 'no-access', message: PAY_BILLS_MESSAGES.noAccess }
    const failed = input.reads.filter(read => read.isError)
    if (failed.length > 0) {
        return {
            kind: 'error',
            message: PAY_BILLS_MESSAGES.loadFailed,
            recovery: mergeRecoveries(failed.map(read => read.recovery)),
        }
    }
    if (input.reads.some(read => !read.isReady)) return { kind: 'loading' }
    if (input.replaces !== null) {
        if (input.replaces.status === null) {
            return { kind: 'not-found', message: PAY_BILLS_MESSAGES.notFound }
        }
        if (input.replaces.status !== 'posted') {
            return { kind: 'cannot-edit', message: PAY_BILLS_MESSAGES.cannotEdit }
        }
    }
    return {
        kind: 'ready',
        list: payBillsListOf(input.rowCount, input.shownCount),
        paidFromEmpty: input.paidFromOptionCount === 0,
    }
}

// The list's surface: the rows, no open bill at all, or filters that hide every bill.
export function payBillsListOf(rowCount: number, shownCount: number): PayBillsList {
    if (rowCount === 0) return 'empty'
    return shownCount === 0 ? 'filtered-empty' : 'rows'
}
