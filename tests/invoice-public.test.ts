import { describe, expect, it } from 'vitest'
import { EMAIL_SHARE_TODAY, INVOICE_PUBLIC_ROWS } from '../tinycld/books/lib/email-share-fixture'
import { invoiceDueLine, invoicePublicState } from '../tinycld/books/lib/invoice-public'
import { formatDay } from '../tinycld/books/lib/register-range'

// The customer's invoice page decides its state from the one public view row (email-share
// spec §3.5 "States"): no row is Not found; a posted row is open, overdue or paid by its
// balance and due date against today; a void row is void or replaced by its forward.

const TODAY = EMAIL_SHARE_TODAY
const OPEN = INVOICE_PUBLIC_ROWS.open

describe('invoicePublicState', () => {
    it('no row is not found', () => {
        expect(invoicePublicState(undefined, TODAY)).toBe('not-found')
    })

    it('posted with a balance and a due date after today is open', () => {
        expect(OPEN.due_date > TODAY).toBe(true)
        expect(invoicePublicState(OPEN, TODAY)).toBe('open')
    })

    it('posted with a balance and the due date today is open', () => {
        expect(invoicePublicState({ ...OPEN, due_date: TODAY }, TODAY)).toBe('open')
    })

    it('posted, balance above zero, due before today is overdue', () => {
        expect(invoicePublicState({ ...OPEN, due_date: '2026-11-15' }, TODAY)).toBe('overdue')
    })

    it('posted with balance 0 is paid, also when its due date is past', () => {
        expect(invoicePublicState({ ...OPEN, balance: 0 }, TODAY)).toBe('paid')
        expect(invoicePublicState({ ...OPEN, balance: 0, due_date: '2026-01-02' }, TODAY)).toBe(
            'paid'
        )
    })

    // Revise 1, item 3: "Paid in full" only when payments cover the total. A zero balance
    // reached through a write-off or a credit memo, in whole or in part, is settled.
    it('the open and paid fixture rows have nothing written off or credited', () => {
        for (const row of [OPEN, INVOICE_PUBLIC_ROWS.paid]) {
            expect(row.written_off).toBe(0)
            expect(row.credited).toBe(0)
        }
    })

    it('balance 0 with the whole total written off is settled, not paid', () => {
        const row = { ...OPEN, balance: 0, written_off: OPEN.total, credited: 0 }
        expect(invoicePublicState(row, TODAY)).toBe('settled')
    })

    it('balance 0 with part paid and the rest written off is settled', () => {
        const row = { ...OPEN, balance: 0, written_off: 1, credited: 0 }
        expect(invoicePublicState(row, TODAY)).toBe('settled')
    })

    it('balance 0 with a credit memo applied is settled, not paid', () => {
        const whole = { ...OPEN, balance: 0, written_off: 0, credited: OPEN.total }
        expect(invoicePublicState(whole, TODAY)).toBe('settled')
        const part = { ...OPEN, balance: 0, written_off: 0, credited: 1 }
        expect(invoicePublicState(part, TODAY)).toBe('settled')
    })

    it('balance 0 with a past due date and a write-off is settled, not overdue', () => {
        const row = { ...OPEN, balance: 0, due_date: '2026-01-02', written_off: OPEN.total }
        expect(invoicePublicState(row, TODAY)).toBe('settled')
    })

    it('a balance above zero with part credited or written off is still open or overdue', () => {
        const credited = { ...OPEN, balance: 1_000, credited: 2_000, written_off: 0 }
        expect(invoicePublicState(credited, TODAY)).toBe('open')
        const late = { ...credited, due_date: '2026-11-15', written_off: 500 }
        expect(invoicePublicState(late, TODAY)).toBe('overdue')
    })

    it('void with no replaced_by_token is void', () => {
        const row = { ...OPEN, status: 'void' as const, balance: 0, replaced_by_token: '' }
        expect(invoicePublicState(row, TODAY)).toBe('void')
    })

    it('void with a replaced_by_token is replaced', () => {
        const row = {
            ...OPEN,
            status: 'void' as const,
            balance: 0,
            replaced_by_token: INVOICE_PUBLIC_ROWS.replaced.replaced_by_token,
            replaced_by_number: '1004',
        }
        expect(invoicePublicState(row, TODAY)).toBe('replaced')
    })

    // A part-paid invoice is still open: only a zero balance is paid.
    it.each([
        ['open', 'open'],
        ['partlyPaid', 'open'],
        ['overdue', 'overdue'],
        ['paid', 'paid'],
        ['settled', 'settled'],
        ['voided', 'void'],
        ['replaced', 'replaced'],
        ['long', 'open'],
    ] as const)('the fixture row %s gives %s', (name, state) => {
        expect(invoicePublicState(INVOICE_PUBLIC_ROWS[name], TODAY)).toBe(state)
    })

    it('covers every fixture row', () => {
        expect(Object.keys(INVOICE_PUBLIC_ROWS).sort()).toEqual(
            [
                'long',
                'open',
                'overdue',
                'paid',
                'partlyPaid',
                'replaced',
                'settled',
                'voided',
            ].sort()
        )
    })

    it('every fixture row carries written_off and credited as numbers', () => {
        for (const row of Object.values(INVOICE_PUBLIC_ROWS)) {
            expect(typeof row.written_off, row.id).toBe('number')
            expect(typeof row.credited, row.id).toBe('number')
        }
    })
})

describe('invoiceDueLine', () => {
    it('a due date after today reads "Due <day>", not overdue', () => {
        expect(invoiceDueLine(OPEN, TODAY)).toEqual({
            text: `Due ${formatDay(OPEN.due_date)}`,
            isOverdue: false,
        })
    })

    it('a due date of today reads "Due <day>", not overdue', () => {
        expect(invoiceDueLine({ ...OPEN, due_date: TODAY }, TODAY)).toEqual({
            text: `Due ${formatDay(TODAY)}`,
            isOverdue: false,
        })
    })

    it('a past due date with a balance above zero reads "Was due <day>", overdue', () => {
        const row = INVOICE_PUBLIC_ROWS.overdue
        expect(row.balance).toBeGreaterThan(0)
        expect(invoiceDueLine(row, TODAY)).toEqual({
            text: `Was due ${formatDay(row.due_date)}`,
            isOverdue: true,
        })
        expect(invoiceDueLine(row, TODAY).text).toBe('Was due Oct 6, 2026')
    })

    it('a past due date with a zero balance reads "Due <day>", not overdue', () => {
        const row = { ...INVOICE_PUBLIC_ROWS.overdue, balance: 0 }
        expect(invoiceDueLine(row, TODAY)).toEqual({
            text: `Due ${formatDay(row.due_date)}`,
            isOverdue: false,
        })
    })
})
