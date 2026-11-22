import { describe, expect, it } from 'vitest'
import { backTarget, popDepth } from '../tinycld/books/hooks/useBackToEntries'
import { nestedStack, screensBelowRoute } from '../tinycld/books/lib/stack-screens'

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
        for (const route of [
            'invoices/[id]',
            'entries/[id]',
            'payments/[id]',
            'expenses/[id]',
            'vendor-credits/[id]',
        ]) {
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
            ['credit-memos/[id]', 'Credit memo'],
            ['refund-receipts/[id]', 'Refund receipt'],
            ['estimates/[id]', 'Estimate'],
            ['expenses/[id]', 'Expense'],
            ['vendor-credits/[id]', 'Vendor credit'],
            ['vendor-refunds/[id]', 'Vendor refund'],
            ['payments/[id]', 'Payment'],
            ['entries/[id]', 'Journal entry'],
            ['transfers/[id]', 'Transfer'],
            ['write-offs/[id]', 'Write-off'],
        ]
        for (const [route, label] of below) {
            expect(backTarget(stack('entries/index', route, 'pay-bills'), 'k2'), route).toEqual({
                route,
                label,
                depth: 1,
            })
        }
    })

    // Write-off spec §3.5: a write-off opened from the invoice's Write-offs section pops
    // back to the invoice.
    it("pops a write-off opened from the invoice's Write-offs section back to the invoice", () => {
        expect(
            backTarget(stack('entries/index', 'invoices/[id]', 'write-offs/[id]'), 'k2')
        ).toEqual({ route: 'invoices/[id]', label: 'Invoice', depth: 1 })
    })

    // Bank deposit spec §3.8 (cp2 fix round 1, item 1): the deposit read view's View journal
    // entry and its item's Transaction link push a read view over the deposit; that view's
    // Back pops to the deposit and names it.
    it('pops the deposit\'s journal entry back to the deposit, named "Deposit"', () => {
        expect(backTarget(stack('entries/index', 'deposits/[id]', 'entries/[id]'), 'k2')).toEqual({
            route: 'deposits/[id]',
            label: 'Deposit',
            depth: 1,
        })
    })

    it("pops a sales receipt opened from a deposit's item link back to the deposit", () => {
        expect(
            backTarget(stack('entries/index', 'deposits/[id]', 'sales-receipts/[id]'), 'k2')
        ).toEqual({ route: 'deposits/[id]', label: 'Deposit', depth: 1 })
    })

    it('steps past read-only bill payments to the bill below them', () => {
        expect(
            backTarget(
                stack('entries/index', 'bills/[id]', 'bill-payments/[id]', 'bill-payments/[id]'),
                'k3'
            )
        ).toEqual({ route: 'bills/[id]', label: 'Bill', depth: 2 })
    })

    // Vendor credit spec §2, as the bill's case: a vendor credit right below is popped to
    // and named.
    it('pops a draft vendor credit opened over a draft vendor credit back to that draft', () => {
        expect(
            backTarget(stack('entries/index', 'vendor-credits/[id]', 'vendor-credits/[id]'), 'k2')
        ).toEqual({ route: 'vendor-credits/[id]', label: 'Vendor credit', depth: 1 })
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

// The Sales lists (sales-lists checkpoint 2): a document opened from a list is a screen of
// its kind's child stack, read as flat screens (lib/stack-screens.ts) whose list screens
// are named `<tab path without books/>/index`. Back pops to the list and names it.
describe('backTarget over the Sales lists', () => {
    it('pops an invoice opened from the Invoices list back to it, named "Invoices"', () => {
        expect(backTarget(stack('invoices/index', 'invoices/[id]'), 'k1')).toEqual({
            route: 'invoices/index',
            label: 'Invoices',
            depth: 1,
        })
    })

    it('pops an invoice opened from All sales back to it, named "Sales"', () => {
        expect(backTarget(stack('sales/index', 'invoices/[id]'), 'k1')).toEqual({
            route: 'sales/index',
            label: 'Sales',
            depth: 1,
        })
    })

    it('pops a payment opened from the Payments list back to it, named "Payments"', () => {
        expect(backTarget(stack('payments/index', 'payments/[id]'), 'k1')).toEqual({
            route: 'payments/index',
            label: 'Payments',
            depth: 1,
        })
    })

    it('pops an entry opened from an Invoices row menu (View journal entry) back to the list', () => {
        expect(backTarget(stack('invoices/index', 'entries/[id]'), 'k1')).toEqual({
            route: 'invoices/index',
            label: 'Invoices',
            depth: 1,
        })
    })

    // Purchase lists checkpoint 3: the purchase list screens are named the same way, and
    // All purchases is "Expenses".
    it('pops a bill opened from the Bills list back to it, named "Bills"', () => {
        expect(backTarget(stack('bills/index', 'bills/[id]'), 'k1')).toEqual({
            route: 'bills/index',
            label: 'Bills',
            depth: 1,
        })
    })

    it('pops a bill opened from All purchases back to it, named "Expenses"', () => {
        expect(backTarget(stack('purchases/index', 'bills/[id]'), 'k1')).toEqual({
            route: 'purchases/index',
            label: 'Expenses',
            depth: 1,
        })
    })

    it('pops a bill payment opened from the Bill payments list back to it, named "Bill payments"', () => {
        expect(backTarget(stack('bill-payments/index', 'bill-payments/[id]'), 'k1')).toEqual({
            route: 'bill-payments/index',
            label: 'Bill payments',
            depth: 1,
        })
    })

    it('replaces an invoice with nothing below with the list route, depth 0', () => {
        expect(backTarget(stack('invoices/[id]'), 'k0')).toEqual({
            route: 'entries/index',
            label: 'Journal entries',
            depth: 0,
        })
    })
})

// A void bill payment reopened over a copy of itself below its kind route (purchase-lists
// cp3 gate 1): entries list → open the original → Edit pushes Pay Bills → the save replaces
// Pay Bills with a second `bill-payments` kind route → search opens the original in it.
// The read view's Back steps past the copy below the kind route to the Journal entries list.
describe('backTarget from a read view in a kind child stack', () => {
    const ownChildStack = {
        routes: [{ key: 'c-bp2-a', name: '[id]', params: { id: 'paymentA000001' } }],
    }
    const rootStack = {
        routes: [
            { key: 'r-entries', name: 'entries/index' },
            {
                key: 'r-bp1',
                name: 'bill-payments',
                state: {
                    routes: [{ key: 'c-bp1-a', name: '[id]', params: { id: 'paymentA000001' } }],
                },
            },
            { key: 'r-bp2', name: 'bill-payments', state: ownChildStack },
        ],
    }
    const seen = {
        routes: nestedStack(screensBelowRoute(rootStack, 'r-bp2'), 'bill-payments', ownChildStack),
    }

    it('reaches the Journal entries list past the copy below the kind route, depth 2', () => {
        expect(backTarget(seen, 'c-bp2-a')).toEqual({
            route: 'entries/index',
            label: 'Journal entries',
            depth: 2,
        })
    })

    it('reads the flat stack [entries/index, bill-payments/[id], bill-payments/[id]] the same way', () => {
        expect(
            backTarget(stack('entries/index', 'bill-payments/[id]', 'bill-payments/[id]'), 'k2')
        ).toEqual({ route: 'entries/index', label: 'Journal entries', depth: 2 })
    })
})
