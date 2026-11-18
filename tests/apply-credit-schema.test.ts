import { describe, expect, it } from 'vitest'
import {
    type ApplyCreditValues,
    appliedToastText,
    applyCreditSchema,
    applySummaryText,
} from '../tinycld/books/lib/apply-credit-schema'
import { closedThroughMessage } from '../tinycld/books/lib/opening-balances-messages'
import { amountToApply, type OutstandingRow } from '../tinycld/books/lib/payment-allocation'
import { PAYMENT_MESSAGES } from '../tinycld/books/lib/payment-texts'

// The apply dialog's one zod schema (vendor credit spec §3.9): the Apply date, each row
// against its open balance (under its Credit to apply cell), the sum against the unapplied
// credit and "at least one bill" (at the root, the dialog's error summary); and the
// summary and toast texts.

const USD = 'USD'
const CREDIT_DATE = '2026-11-12'
const CLOSE_DATE = '2026-10-31'

// Two open bills of the credit's vendor, in list order.
const ROWS: OutstandingRow[] = [
    {
        id: 'billbig00000001',
        number: '1003',
        date: '2026-11-01',
        due_date: '2026-12-01',
        total: 125_000,
        open: 125_000,
    },
    {
        id: 'billsmall000001',
        number: '1004',
        date: '2026-11-02',
        due_date: '2026-12-02',
        total: 3_000,
        open: 3_000,
    },
]
const [BIG, SMALL] = ROWS

type SchemaInput = Parameters<typeof applyCreditSchema>[0]

const INPUT: SchemaInput = {
    creditDate: CREDIT_DATE,
    closeDate: CLOSE_DATE,
    unappliedCents: 5_000,
    rows: ROWS,
    currency: USD,
}

function payment(row: OutstandingRow, amount: string) {
    return { amount, open: row.open, number: row.number }
}

// $50.00 of credit, every cent placed: 20.10 + 29.90.
const VALID: ApplyCreditValues = {
    date: '2026-11-16',
    payments: { [BIG.id]: payment(BIG, '20.10'), [SMALL.id]: payment(SMALL, '29.90') },
}

function issues(values: ApplyCreditValues, input: SchemaInput = INPUT) {
    const result = applyCreditSchema(input).safeParse(values)
    if (result.success) return []
    return result.error.issues.map(issue => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
    }))
}

function messagesAt(values: ApplyCreditValues, path: string, input: SchemaInput = INPUT) {
    return issues(values, input)
        .filter(issue => issue.path === path)
        .map(issue => issue.message)
}

describe('applyCreditSchema: the Apply date', () => {
    it('refuses a day that does not exist, under date', () => {
        expect(messagesAt({ ...VALID, date: '2026-11-31' }, 'date')).toEqual([
            PAYMENT_MESSAGES.dateInvalid,
        ])
        expect(messagesAt({ ...VALID, date: 'next week' }, 'date')).toEqual([
            PAYMENT_MESSAGES.dateInvalid,
        ])
    })

    it('refuses a day before the credit date, under date', () => {
        expect(messagesAt({ ...VALID, date: '2026-11-11' }, 'date')).toEqual([
            "The apply date can't be before the credit date.",
        ])
    })

    it('accepts the credit date itself', () => {
        expect(issues({ ...VALID, date: CREDIT_DATE })).toEqual([])
    })

    it('refuses a day on or before the close date with the close-date text, under date', () => {
        // A credit dated after the close date, with books closed through Nov 14.
        const closed = { ...INPUT, closeDate: '2026-11-14' }
        const text = closedThroughMessage('2026-11-14')
        expect(messagesAt({ ...VALID, date: '2026-11-14' }, 'date', closed)).toEqual([text])
        expect(messagesAt({ ...VALID, date: '2026-11-13' }, 'date', closed)).toEqual([text])
        expect(messagesAt({ ...VALID, date: '2026-11-15' }, 'date', closed)).toEqual([])
    })
})

describe('applyCreditSchema: the rows', () => {
    it('refuses a row above its open balance under that row’s cell', () => {
        // Plenty of credit, so only the row's own rule speaks.
        const rich = { ...INPUT, unappliedCents: 500_000 }
        const values = { ...VALID, payments: { [BIG.id]: payment(BIG, '1,300.00') } }
        expect(messagesAt(values, `payments.${BIG.id}.amount`, rich)).toEqual([
            'More than the open balance of $1,250.00',
        ])
        expect(messagesAt(values, `payments.${SMALL.id}.amount`, rich)).toEqual([])
    })

    it('refuses a sum above the unapplied credit at the root', () => {
        const values = {
            ...VALID,
            payments: { [BIG.id]: payment(BIG, '30.00'), [SMALL.id]: payment(SMALL, '30.00') },
        }
        expect(messagesAt(values, 'root')).toEqual(['More than the unapplied credit of $50.00.'])
        expect(messagesAt(values, `payments.${BIG.id}.amount`)).toEqual([])
        expect(messagesAt(values, `payments.${SMALL.id}.amount`)).toEqual([])
    })

    it('asks for at least one bill above zero at the root', () => {
        expect(messagesAt({ ...VALID, payments: {} }, 'root')).toEqual([
            'Select at least one bill.',
        ])
    })

    // A bill that left the list (paid elsewhere) can keep an entry in the form's payments;
    // the dialog draws no row for it, so no rule counts it.
    const GONE = 'billgone0000001'
    const gone = (amount: string) => ({ amount, open: 3_000, number: '1009' })

    it('does not count an unlisted bill in the sum', () => {
        const values = { ...VALID, payments: { ...VALID.payments, [GONE]: gone('30.00') } }
        expect(issues(values)).toEqual([])
    })

    it('asks for at least one bill when only an unlisted bill is above zero', () => {
        expect(messagesAt({ ...VALID, payments: { [GONE]: gone('30.00') } }, 'root')).toEqual([
            'Select at least one bill.',
        ])
    })

    it('gives no row error for an unlisted bill above its own open balance', () => {
        const values = { ...VALID, payments: { ...VALID.payments, [GONE]: gone('40.00') } }
        expect(messagesAt(values, `payments.${GONE}.amount`)).toEqual([])
    })

    it('passes a valid set, which sums to integer cents', () => {
        const result = applyCreditSchema(INPUT).safeParse(VALID)
        expect(result.success).toBe(true)
        if (!result.success) return
        const applied = amountToApply(result.data.payments, USD)
        expect(Number.isInteger(applied)).toBe(true)
        expect(applied).toBe(5_000)
    })
})

describe('applySummaryText', () => {
    it('reads what is applied, to how many bills, and what stays unapplied', () => {
        expect(applySummaryText(5_000, 2, 0, USD)).toBe(
            'Applying $50.00 to 2 bills · $0.00 stays unapplied'
        )
    })

    it('says "1 bill" for one bill', () => {
        expect(applySummaryText(3_000, 1, 2_000, USD)).toBe(
            'Applying $30.00 to 1 bill · $20.00 stays unapplied'
        )
    })
})

describe('appliedToastText', () => {
    it('reads what was applied and to how many bills', () => {
        expect(appliedToastText(5_000, 2, USD)).toBe('Applied $50.00 to 2 bills')
        expect(appliedToastText(3_000, 1, USD)).toBe('Applied $30.00 to 1 bill')
    })
})
