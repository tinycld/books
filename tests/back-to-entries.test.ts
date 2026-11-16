import { describe, expect, it } from 'vitest'
import { backTarget, popDepth } from '../tinycld/books/hooks/useBackToEntries'

// How far Back pops (cp 4 item D1). Back steps past the screens of the same route right
// below this one only on a read-only route (a bill payment read view opened from another),
// where no input can be lost. A form route (a draft bill opened by search over another
// draft bill) goes back one screen, to the draft below, which keeps what the user typed.

function stack(...names: string[]) {
    return { routes: names.map((name, index) => ({ key: `k${index}`, name })) }
}

describe('popDepth', () => {
    it('is 0 at the root of the stack', () => {
        expect(popDepth(stack('bills/[id]'), 'k0')).toBe(0)
    })

    it('goes back one screen to another route', () => {
        expect(popDepth(stack('entries/index', 'bills/[id]'), 'k1')).toBe(1)
    })

    it('goes back one screen to a draft bill of the same form route, never past it', () => {
        expect(popDepth(stack('entries/index', 'bills/[id]', 'bills/[id]'), 'k2')).toBe(1)
    })

    it('goes back one screen on every form route of the same name', () => {
        for (const route of ['invoices/[id]', 'entries/[id]', 'payments/[id]', 'expenses/[id]']) {
            expect(popDepth(stack('entries/index', route, route), 'k2'), route).toBe(1)
        }
    })

    it('steps past bill payment read views below a bill payment read view', () => {
        expect(
            popDepth(
                stack(
                    'entries/index',
                    'bill-payments/[id]',
                    'bill-payments/[id]',
                    'bill-payments/[id]'
                ),
                'k3'
            )
        ).toBe(3)
    })

    it('stops a read-only step at the root of the stack', () => {
        expect(popDepth(stack('bill-payments/[id]', 'bill-payments/[id]'), 'k1')).toBe(1)
    })
})

// Where Back leads and what its label says (cp 4 fix round 1, item 1). A record route
// right below this screen (a document, a bill payment, a payment, an entry, a transfer)
// is popped to and named: the label never says "Journal entries" when Back goes to a
// bill. `depth` is how many screens Back pops; 0 means Back replaces this screen with
// `route` (nothing to pop to).
describe('backTarget', () => {
    it('pops Pay Bills opened by Pay bill back to the bill, named "Bill"', () => {
        expect(backTarget(stack('entries/index', 'bills/[id]', 'pay-bills'), 'k2')).toEqual({
            route: 'bills/[id]',
            label: 'Bill',
            depth: 1,
        })
    })

    it("pops a bill payment opened from the bill's Payments block back to the bill", () => {
        expect(
            backTarget(stack('entries/index', 'bills/[id]', 'bill-payments/[id]'), 'k2')
        ).toEqual({ route: 'bills/[id]', label: 'Bill', depth: 1 })
    })

    it("pops a bill opened from a bill payment's Bills paid back to the bill payment", () => {
        expect(
            backTarget(stack('entries/index', 'bill-payments/[id]', 'bills/[id]'), 'k2')
        ).toEqual({ route: 'bill-payments/[id]', label: 'Bill payment', depth: 1 })
    })

    it('pops to each known record route below and names it', () => {
        const below: [string, string][] = [
            ['invoices/[id]', 'Invoice'],
            ['sales-receipts/[id]', 'Sales receipt'],
            ['estimates/[id]', 'Estimate'],
            ['expenses/[id]', 'Expense'],
            ['payments/[id]', 'Payment'],
            ['entries/[id]', 'Journal entry'],
            ['transfers/[id]', 'Transfer'],
        ]
        for (const [route, label] of below) {
            expect(backTarget(stack('entries/index', route, 'pay-bills'), 'k2'), route).toEqual({
                route,
                label,
                depth: 1,
            })
        }
    })

    it('steps past read-only bill payments to the bill below them', () => {
        expect(
            backTarget(
                stack('entries/index', 'bills/[id]', 'bill-payments/[id]', 'bill-payments/[id]'),
                'k3'
            )
        ).toEqual({ route: 'bills/[id]', label: 'Bill', depth: 2 })
    })

    it('pops a draft bill opened over a draft bill back to that draft', () => {
        expect(backTarget(stack('entries/index', 'bills/[id]', 'bills/[id]'), 'k2')).toEqual({
            route: 'bills/[id]',
            label: 'Bill',
            depth: 1,
        })
    })

    it('pops to the list or a register below, as before', () => {
        expect(backTarget(stack('entries/index', 'bills/[id]'), 'k1')).toEqual({
            route: 'entries/index',
            label: 'Journal entries',
            depth: 1,
        })
        expect(backTarget(stack('accounts/[id]', 'entries/[id]'), 'k1')).toEqual({
            route: 'accounts/[id]',
            label: 'Register',
            depth: 1,
        })
    })

    it('replaces with the list at the root, or with the estimate an invoice is made from', () => {
        expect(backTarget(stack('bills/[id]'), 'k0')).toEqual({
            route: 'entries/index',
            label: 'Journal entries',
            depth: 0,
        })
        expect(backTarget(stack('invoices/[id]'), 'k0', 'estimate1234567')).toEqual({
            route: 'estimates/[id]',
            label: 'Estimate',
            depth: 0,
        })
    })
})
