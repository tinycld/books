import { describe, expect, it } from 'vitest'
import {
    DEPOSIT_FIXTURE_ACCOUNT_IDS,
    DEPOSIT_FIXTURE_ACCOUNTS,
    DEPOSIT_IDS,
    DEPOSIT_TODAY,
    depositById,
    depositItemsOf,
    depositLinesOf,
    UNDEPOSITED_LINE_IDS,
} from '../tinycld/books/lib/bank-deposit-fixture'
import { toggleItem } from '../tinycld/books/lib/deposit'
import { depositDefaults, depositValuesOf } from '../tinycld/books/lib/deposit-values'
import { parseMoney } from '../tinycld/books/lib/money-text'

// The deposit form's values (bank deposit spec §3.3, §3.4): the header fields, the ticked
// items as `{ line }` in position order, and the other funds lines with typed amounts.

const ACCT = DEPOSIT_FIXTURE_ACCOUNT_IDS
const LINE = UNDEPOSITED_LINE_IDS
const linesOf = (items: readonly { line: string }[]) => items.map(item => item.line)

describe('depositDefaults', () => {
    it('opens on the first active bank account, today, with no tick, no line and no memo', () => {
        expect(
            depositDefaults({ accounts: DEPOSIT_FIXTURE_ACCOUNTS, today: DEPOSIT_TODAY })
        ).toEqual({
            deposit_to: ACCT.checking,
            date: DEPOSIT_TODAY,
            memo: '',
            items: [],
            lines: [],
        })
    })

    it('opens with no Deposit to when the chart has no bank account', () => {
        const noBank = DEPOSIT_FIXTURE_ACCOUNTS.filter(account => account.type !== 'bank')
        const values = depositDefaults({ accounts: noBank, today: DEPOSIT_TODAY })
        expect(values.deposit_to).toBe('')
        expect(values.items).toEqual([])
    })
})

describe('depositValuesOf', () => {
    it('reads a stored draft: its header, every stored item ticked, its lines as typed text', () => {
        const values = depositValuesOf(
            depositById(DEPOSIT_IDS.draft),
            depositItemsOf(DEPOSIT_IDS.draft),
            depositLinesOf(DEPOSIT_IDS.draft)
        )
        expect(values.deposit_to).toBe(ACCT.checking)
        expect(values.date).toBe('2026-11-01')
        expect(values.memo).toBe('Friday night drop, bag 0417')
        expect(linesOf(values.items)).toEqual([LINE.payment, LINE.vendorRefund, LINE.taken])
        expect(values.lines).toEqual([
            expect.objectContaining({
                account: ACCT.interest,
                description: 'October interest',
                amount: '12.40',
            }),
        ])
    })

    it('round-trips a stored deposit: the typed amounts parse back to the stored cents', () => {
        const stored = depositLinesOf(DEPOSIT_IDS.posted)
        const values = depositValuesOf(
            depositById(DEPOSIT_IDS.posted),
            depositItemsOf(DEPOSIT_IDS.posted),
            stored
        )
        expect(values.lines.map(line => line.amount)).toEqual(['12.40', '-15.00'])
        expect(values.lines.map(line => parseMoney(line.amount))).toEqual(
            stored.map(line => line.amount)
        )
        expect(values.lines.map(line => line.account)).toEqual(stored.map(line => line.account))
        expect(values.lines.map(line => line.description)).toEqual(
            stored.map(line => line.description)
        )
        expect(linesOf(values.items)).toEqual(
            depositItemsOf(DEPOSIT_IDS.posted).map(row => row.line)
        )
        expect(values.date).toBe('2026-11-14')
    })

    it('orders the stored items by position, whatever order they arrive in, and puts a new tick last', () => {
        const stored = depositItemsOf(DEPOSIT_IDS.draft)
        const shuffled = [stored[2], stored[0], stored[1]].filter(row => row !== undefined)
        const values = depositValuesOf(
            depositById(DEPOSIT_IDS.draft),
            shuffled,
            depositLinesOf(DEPOSIT_IDS.draft)
        )
        expect(linesOf(values.items)).toEqual([LINE.payment, LINE.vendorRefund, LINE.taken])
        expect(linesOf(toggleItem(values.items, LINE.journal))).toEqual([
            LINE.payment,
            LINE.vendorRefund,
            LINE.taken,
            LINE.journal,
        ])
    })
})
