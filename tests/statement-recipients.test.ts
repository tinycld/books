import { describe, expect, it } from 'vitest'
import {
    filterRecipients,
    mergeRecipients,
    type RecipientRow,
    recipientLabel,
    recipientTotal,
    sortRecipients,
    tickState,
    totalCaption,
} from '../tinycld/books/lib/statement-recipients'

// The create screen's recipients list (statements spec §3.2, §3.3, §3.10): the Customer
// balance filter, the order, the label, how the field array follows the live rows (ticks
// and typed addresses stay), the total and the heading tick box.

function row(customer: string, over: Partial<RecipientRow> = {}): RecipientRow {
    return {
        customer,
        name: customer,
        parentName: '',
        email: `${customer.toLowerCase()}@example.com`,
        inactive: false,
        balance: 0,
        overdue: false,
        ...over,
    }
}

const OPEN = row('Open', { balance: 12_500 })
const OVERDUE = row('Overdue', { balance: 40_000, overdue: true })
const ZERO = row('Zero', { balance: 0 })
const CREDIT = row('Credit', { balance: -3_000 })
const INACTIVE_OWING = row('Owing', { balance: 7_000, inactive: true })
const INACTIVE_ZERO = row('Gone', { balance: 0, inactive: true })
const INACTIVE_CREDIT = row('Refund', { balance: -500, inactive: true })

const ALL_ROWS = [OPEN, OVERDUE, ZERO, CREDIT, INACTIVE_OWING, INACTIVE_ZERO, INACTIVE_CREDIT]

function customersOf(rows: readonly RecipientRow[]) {
    return rows.map(r => r.customer).sort()
}

describe('filterRecipients', () => {
    it('Open keeps only a balance above zero, an inactive customer with one too', () => {
        const kept = filterRecipients(ALL_ROWS, 'open')
        expect(customersOf(kept)).toEqual(['Open', 'Overdue', 'Owing'])
        const owing = kept.find(r => r.customer === 'Owing')
        if (!owing) throw new Error('the inactive customer with a balance is not kept')
        expect(recipientLabel(owing)).toMatch(/ \(inactive\)$/)
    })

    it('Overdue keeps only the overdue customers', () => {
        expect(customersOf(filterRecipients(ALL_ROWS, 'overdue'))).toEqual(['Overdue'])
    })

    it('All keeps every active customer and an inactive one only when its balance is not zero', () => {
        expect(customersOf(filterRecipients(ALL_ROWS, 'all'))).toEqual(
            ['Open', 'Overdue', 'Zero', 'Credit', 'Owing', 'Refund'].sort()
        )
    })

    it('lists a credit balance in All only', () => {
        expect(customersOf(filterRecipients([CREDIT], 'open'))).toEqual([])
        expect(customersOf(filterRecipients([CREDIT], 'overdue'))).toEqual([])
        expect(customersOf(filterRecipients([CREDIT], 'all'))).toEqual(['Credit'])
    })
})

describe('sortRecipients', () => {
    it('sorts by name ignoring case, a sub-customer directly under its parent', () => {
        const rows = [
            row('juniper', { name: 'Juniper Dental' }),
            row('events', { name: 'Events', parentName: 'Harborview' }),
            row('aspen', { name: 'aspen Ridge' }),
            row('harbor', { name: 'Harborview' }),
            row('kitchen', { name: 'kitchen', parentName: 'Harborview' }),
        ]
        expect(sortRecipients(rows).map(recipientLabel)).toEqual([
            'aspen Ridge',
            'Harborview',
            'Harborview:Events',
            'Harborview:kitchen',
            'Juniper Dental',
        ])
    })
})

describe('recipientLabel', () => {
    it('names a sub-customer "<parent>:<name>"', () => {
        expect(recipientLabel(row('ev', { name: 'Events', parentName: 'Harborview' }))).toBe(
            'Harborview:Events'
        )
    })

    it('ends an inactive customer\'s name with " (inactive)"', () => {
        expect(recipientLabel(row('mill', { name: 'Old Mill', inactive: true }))).toBe(
            'Old Mill (inactive)'
        )
        expect(
            recipientLabel(row('boise', { name: 'Boise', parentName: 'Northwind', inactive: true }))
        ).toBe('Northwind:Boise (inactive)')
    })

    it('leaves an active top-level name as it is', () => {
        expect(recipientLabel(row('aspen', { name: 'Aspen Ridge' }))).toBe('Aspen Ridge')
    })
})

type Recipient = { customer: string; ticked: boolean; email: string }

function byCustomer(recipients: readonly Recipient[]) {
    return [...recipients].sort((a, b) => a.customer.localeCompare(b.customer))
}

describe('mergeRecipients', () => {
    const A = row('A', { email: 'a@example.com' })
    const B = row('B', { email: 'b@example.com' })
    const C = row('C', { email: 'c@example.com' })

    it('ticks every customer with its email at first load', () => {
        expect(byCustomer(mergeRecipients([], [A, B], undefined))).toEqual([
            { customer: 'A', ticked: true, email: 'a@example.com' },
            { customer: 'B', ticked: true, email: 'b@example.com' },
        ])
    })

    it('keeps the tick and the typed address of a customer that stays, ticks a new one with its email, and drops one that left', () => {
        const previous: Recipient[] = [
            { customer: 'A', ticked: false, email: 'typed@example.com' },
            { customer: 'B', ticked: true, email: 'b@example.com' },
        ]
        expect(byCustomer(mergeRecipients(previous, [A, C], undefined))).toEqual([
            { customer: 'A', ticked: false, email: 'typed@example.com' },
            { customer: 'C', ticked: true, email: 'c@example.com' },
        ])
    })

    it('with `only` at first load, ticks only that customer', () => {
        expect(byCustomer(mergeRecipients([], [A, B, C], 'B'))).toEqual([
            { customer: 'A', ticked: false, email: 'a@example.com' },
            { customer: 'B', ticked: true, email: 'b@example.com' },
            { customer: 'C', ticked: false, email: 'c@example.com' },
        ])
    })

    it("keeps a typed address when the customer's own email changes", () => {
        const previous: Recipient[] = [{ customer: 'A', ticked: true, email: 'typed@example.com' }]
        const renamed = row('A', { email: 'new@example.com' })
        expect(mergeRecipients(previous, [renamed], undefined)).toEqual([
            { customer: 'A', ticked: true, email: 'typed@example.com' },
        ])
    })
})

describe('recipientTotal', () => {
    it('sums the balances of the ticked rows only, a credit lowering it', () => {
        const rows = [
            row('A', { balance: 10_000 }),
            row('B', { balance: 25_050 }),
            row('C', { balance: -3_000 }),
        ]
        const recipients: Recipient[] = [
            { customer: 'A', ticked: true, email: '' },
            { customer: 'B', ticked: false, email: '' },
            { customer: 'C', ticked: true, email: '' },
        ]
        expect(recipientTotal(rows, recipients)).toBe(7_000)
    })

    it('is zero with no tick', () => {
        const rows = [row('A', { balance: 10_000 })]
        expect(recipientTotal(rows, [{ customer: 'A', ticked: false, email: '' }])).toBe(0)
    })
})

describe('totalCaption', () => {
    it('names the count of ticked customers', () => {
        expect(totalCaption(0)).toBe('No customer selected')
        expect(totalCaption(1)).toBe('Total balance of 1 customer')
        expect(totalCaption(7)).toBe('Total balance of 7 customers')
    })
})

describe('tickState', () => {
    const on = (customer: string): Recipient => ({ customer, ticked: true, email: '' })
    const off = (customer: string): Recipient => ({ customer, ticked: false, email: '' })

    it('is all, some or none', () => {
        expect(tickState([on('A'), on('B')])).toBe('all')
        expect(tickState([on('A'), off('B')])).toBe('some')
        expect(tickState([off('A'), off('B')])).toBe('none')
    })
})
