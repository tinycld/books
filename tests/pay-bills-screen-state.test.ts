import { describe, expect, it } from 'vitest'
import type { LiveRecovery } from '../tinycld/books/lib/live-recovery'
import { PAID_FROM_EMPTY_TEXT } from '../tinycld/books/lib/paid-from'
import { payBillsScreenState } from '../tinycld/books/lib/pay-bills-screen-state'
import { PAY_BILLS_MESSAGES } from '../tinycld/books/lib/pay-bills-texts'

// Which surface Pay Bills shows (spec §3.3 Empty, §3.5 Writers only and States): loading,
// a load error with one Retry over every failed read, no access, a `?replaces` payment that
// does not exist or is not posted, and the form, whose list is the rows, the empty state or
// the filtered-empty state. These states are transient or role-bound, so e2e does not drive
// them (plan: E2E budget).

type Input = Parameters<typeof payBillsScreenState>[0]
type Read = Input['reads'][number]

// Stand-ins for the failed queries and their sources: the state only passes them on.
function recovery(query: string, sources: string[]): LiveRecovery {
    return {
        queries: [query],
        sources,
    } as unknown as LiveRecovery
}

const BILLS: Read = { isReady: true, isError: false, recovery: recovery('bills', []) }
const VENDORS: Read = { isReady: true, isError: false, recovery: recovery('vendors', []) }
const ACCOUNTS: Read = { isReady: true, isError: false, recovery: recovery('accounts', []) }

// A writer on a new Pay Bills with every read ready, open bills listed, a Paid from option.
const READY: Input = {
    canWrite: true,
    reads: [BILLS, VENDORS, ACCOUNTS],
    replaces: null,
    rowCount: 4,
    shownCount: 4,
    paidFromOptionCount: 2,
}

describe('payBillsScreenState', () => {
    it('is the form with its rows when every read is ready', () => {
        expect(payBillsScreenState(READY)).toEqual({
            kind: 'ready',
            list: 'rows',
            paidFromEmpty: false,
        })
    })

    it('is loading while a read is not ready', () => {
        const state = payBillsScreenState({
            ...READY,
            reads: [BILLS, { ...VENDORS, isReady: false }, ACCOUNTS],
        })
        expect(state).toEqual({ kind: 'loading' })
    })

    it('is the error with one recovery over every failed read', () => {
        const bills = {
            ...BILLS,
            isReady: false,
            isError: true,
            recovery: recovery('bills', ['books_bills', 'books_vendors']),
        }
        const accounts = {
            ...ACCOUNTS,
            isReady: false,
            isError: true,
            recovery: recovery('accounts', ['books_accounts', 'books_vendors']),
        }
        const state = payBillsScreenState({ ...READY, reads: [bills, VENDORS, accounts] })
        expect(state).toEqual({
            kind: 'error',
            message: PAY_BILLS_MESSAGES.loadFailed,
            recovery: {
                queries: ['bills', 'accounts'],
                sources: ['books_bills', 'books_vendors', 'books_accounts'],
            },
        })
        expect(PAY_BILLS_MESSAGES.loadFailed).toBe('Books could not load the open bills.')
    })

    it('gives a non-writer the no-access state, even while reads load', () => {
        const noAccess = {
            kind: 'no-access',
            message: 'You need bookkeeper access to pay bills',
        }
        expect(payBillsScreenState({ ...READY, canWrite: false })).toEqual(noAccess)
        expect(
            payBillsScreenState({
                ...READY,
                canWrite: false,
                reads: [{ ...BILLS, isReady: false }, VENDORS, ACCOUNTS],
            })
        ).toEqual(noAccess)
    })

    it('gives ?replaces of a payment with no row the not-found state', () => {
        expect(payBillsScreenState({ ...READY, replaces: { status: null } })).toEqual({
            kind: 'not-found',
            message: 'This bill payment does not exist',
        })
    })

    it('gives ?replaces of a void payment the cannot-edit state, of a posted one the form', () => {
        expect(payBillsScreenState({ ...READY, replaces: { status: 'void' } })).toEqual({
            kind: 'cannot-edit',
            message: 'This bill payment cannot be edited',
        })
        expect(payBillsScreenState({ ...READY, replaces: { status: 'posted' } })).toMatchObject({
            kind: 'ready',
        })
    })

    it('shows the empty state when no bill is open at all', () => {
        const state = payBillsScreenState({ ...READY, rowCount: 0, shownCount: 0 })
        expect(state).toMatchObject({ kind: 'ready', list: 'empty' })
        expect(PAY_BILLS_MESSAGES.noOpenBills).toBe(
            'No open bills. Bills you post show here until they are paid.'
        )
    })

    it('shows the filtered-empty state when the filters hide every open bill', () => {
        const state = payBillsScreenState({ ...READY, rowCount: 4, shownCount: 0 })
        expect(state).toMatchObject({ kind: 'ready', list: 'filtered-empty' })
        expect(PAY_BILLS_MESSAGES.filterEmpty).toBe('No open bills match these filters.')
    })

    it('marks Paid from empty when the chart has no bank or credit card account', () => {
        const state = payBillsScreenState({ ...READY, paidFromOptionCount: 0 })
        expect(state).toMatchObject({ kind: 'ready', paidFromEmpty: true })
        expect(PAID_FROM_EMPTY_TEXT).toBe(
            'Add a bank or credit card account to the chart of accounts'
        )
    })
})
