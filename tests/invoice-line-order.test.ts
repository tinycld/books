import type { TableRowWrite, TableWritePlan } from '@tinycld/core/lib/forms/table-rows'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import {
    type DocumentLineInput,
    type DocumentTax,
    documentTotals,
    MAX_DOCUMENT_LINES,
} from '../tinycld/books/lib/document-lines'
import { invoiceLineWriteSteps } from '../tinycld/books/lib/invoice-line-order'
import { INVOICE_LINE_MAPPER } from '../tinycld/books/lib/invoice-lines'
import { maxStoredAmount } from '../tinycld/books/lib/money-text'

// A stored invoice line, as the server holds it between two writes.
type Stored = {
    id: string
    kind: DocumentLineInput['kind']
    quantity: number
    rate: number
    percent_ppm: number
    taxable: boolean
    position: number
}

const TAX: DocumentTax = null

// Table rows as the form holds them (rate and percent are typed text).
const item = (id: string, quantity: number, rate: string): TableRow => ({
    id,
    kind: 'item',
    product: 'prod',
    description: '',
    quantity,
    rate,
    percent: null,
    amount: null,
    taxable: false,
})
const percent = (id: string, text: string): TableRow => ({
    id,
    kind: 'percent',
    product: 'disc',
    description: '',
    quantity: null,
    rate: null,
    percent: text,
    amount: null,
    taxable: false,
})
const description = (id: string): TableRow => ({
    id,
    kind: 'description',
    product: '',
    description: 'Note',
    quantity: null,
    rate: null,
    percent: null,
    amount: null,
    taxable: false,
})

// The stored line a row write leaves on the server.
function storedOf(row: TableRow, position: number): Stored {
    const record = INVOICE_LINE_MAPPER.toRecord(row, position)
    return {
        id: row.id,
        kind: record.kind,
        quantity: record.quantity,
        rate: record.rate,
        percent_ppm: record.percent_ppm,
        taxable: record.taxable,
        position: record.position,
    }
}

// What the server refuses about a whole stored invoice (server/invoices.go
// checkInvoiceTotals and the line count), read through documentTotals. Lines are in
// the server's order: position, then id.
function refusalOf(store: ReadonlyMap<string, Stored>): string | null {
    if (store.size > MAX_DOCUMENT_LINES) return 'more than 250 lines'
    const ordered = [...store.values()].sort((a, b) =>
        a.position !== b.position ? a.position - b.position : a.id < b.id ? -1 : 1
    )
    const totals = documentTotals(
        ordered.map(line => ({
            kind: line.kind,
            quantity: line.quantity,
            rate: line.rate,
            percentPpm: line.percent_ppm,
            taxable: line.taxable,
        })),
        TAX
    )
    if (totals.percentTargetErrors.length > 0) return 'percent with no target'
    if (totals.isTooLarge) return 'line too large'
    if (totals.total < 0) return 'negative total'
    if (totals.total > maxStoredAmount || totals.subtotal > maxStoredAmount)
        return 'total too large'
    return null
}

// A fake server: each op writes the store, and every state after a write is checked.
function server(initial: readonly Stored[]) {
    const store = new Map(initial.map(line => [line.id, line]))
    const refusals: string[] = []
    const check = () => {
        const refusal = refusalOf(store)
        if (refusal) refusals.push(refusal)
    }
    const ops = {
        insert: (write: TableRowWrite) => {
            store.set(write.row.id, storedOf(write.row, write.position))
            check()
            return `insert:${write.row.id}`
        },
        update: (write: TableRowWrite) => {
            store.set(write.row.id, storedOf(write.row, write.position))
            check()
            return `update:${write.row.id}`
        },
        remove: (id: string) => {
            store.delete(id)
            check()
            return `remove:${id}`
        },
    }
    const orderedIds = () =>
        [...store.values()]
            .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1))
            .map(line => line.id)
    return { store, refusals, ops, orderedIds }
}

// Runs the module's order against a fresh fake server.
function runOrdered(stored: readonly Stored[], plan: TableWritePlan) {
    const fake = server(stored)
    const steps = invoiceLineWriteSteps({ storedLines: stored, plan, tax: TAX, ops: fake.ops })
    const ran = steps.map(step => step.run())
    return { ...fake, ran }
}

// Runs a fixed, naive order of the same writes against a fresh fake server.
type Naive = { remove: string } | { update: TableRowWrite } | { insert: TableRowWrite }
function runNaive(stored: readonly Stored[], order: readonly Naive[]) {
    const fake = server(stored)
    for (const write of order) {
        if ('remove' in write) fake.ops.remove(write.remove)
        else if ('update' in write) fake.ops.update(write.update)
        else fake.ops.insert(write.insert)
    }
    return fake
}

const storedRows = (rows: readonly TableRow[]) => rows.map((row, i) => storedOf(row, i))

describe('invoiceLineWriteSteps', () => {
    it('moves a Percent line together with its target past a Description line without leaving the percent untargeted', () => {
        // Stored: Note, Item b, Percent c (of b). Final: Item b, Percent c, Note.
        const z = description('z')
        const b = item('b', 1, '100.00')
        const c = percent('c', '-10')
        const stored = storedRows([z, b, c])
        const plan: TableWritePlan = {
            insert: [],
            update: [
                { row: b, position: 0 },
                { row: c, position: 1 },
                { row: z, position: 2 },
            ],
            remove: [],
        }

        // Updates by position: b moves to 0 first, sorts above Note (tie broken by id),
        // and leaves c under the Note.
        const naive = runNaive(stored, [
            { update: plan.update[0] },
            { update: plan.update[1] },
            { update: plan.update[2] },
        ])
        expect(naive.refusals).toContain('percent with no target')

        const ordered = runOrdered(stored, plan)
        expect(ordered.refusals).toEqual([])
        expect(ordered.ran).toHaveLength(3)
        expect(ordered.orderedIds()).toEqual(['b', 'c', 'z'])
    })

    it('removes a percent line before the item above it when both go', () => {
        // Stored: Note, Item b, Percent p (of b), Item e. Final: Note, Item e.
        const d = description('d')
        const b = item('b', 1, '100.00')
        const p = percent('p', '-10')
        const e = item('e', 2, '30.00')
        const stored = storedRows([d, b, p, e])
        // core's plan lists removes top-down (createTablePlans: before.filter).
        const plan: TableWritePlan = {
            insert: [],
            update: [{ row: e, position: 1 }],
            remove: ['b', 'p'],
        }

        // Removes top-down: b goes first and p sits under the Note.
        const naive = runNaive(stored, [
            { remove: 'b' },
            { remove: 'p' },
            { update: plan.update[0] },
        ])
        expect(naive.refusals).toContain('percent with no target')

        const ordered = runOrdered(stored, plan)
        expect(ordered.refusals).toEqual([])
        expect(ordered.ran.indexOf('remove:p')).toBeLessThan(ordered.ran.indexOf('remove:b'))
        expect(ordered.orderedIds()).toEqual(['d', 'e'])
    })

    it('inserts a discount and its item so that the discount is never stored without its item', () => {
        // Stored: Note. Final: Note, Item x, Percent q (of x) — both new; q is listed
        // before x in the plan.
        const n = description('n')
        const x = item('x', 1, '200.00')
        const q = percent('q', '-25')
        const stored = storedRows([n])
        const plan: TableWritePlan = {
            insert: [
                { row: q, position: 2 },
                { row: x, position: 1 },
            ],
            update: [],
            remove: [],
        }

        // The discount first: it is stored under the Note with no item above it.
        const naive = runNaive(stored, [{ insert: plan.insert[0] }, { insert: plan.insert[1] }])
        expect(naive.refusals).toContain('percent with no target')

        const ordered = runOrdered(stored, plan)
        expect(ordered.refusals).toEqual([])
        expect(ordered.ran).toEqual(['insert:x', 'insert:q'])
        expect(ordered.orderedIds()).toEqual(['n', 'x', 'q'])
    })

    it('runs updates before inserts when an inserted credit line would take the total below zero', () => {
        // Stored: Item a at 10.00. Final: credit Item c at -50.00, then Item a at 100.00.
        const aBefore = item('a', 1, '10.00')
        const aAfter = item('a', 1, '100.00')
        const c = item('c', 1, '-50.00')
        const stored = storedRows([aBefore])
        const plan: TableWritePlan = {
            insert: [{ row: c, position: 0 }],
            update: [{ row: aAfter, position: 1 }],
            remove: [],
        }

        // Inserts before updates: -50.00 + 10.00 is stored for a moment.
        const naive = runNaive(stored, [{ insert: plan.insert[0] }, { update: plan.update[0] }])
        expect(naive.refusals).toContain('negative total')

        const ordered = runOrdered(stored, plan)
        expect(ordered.refusals).toEqual([])
        expect(ordered.ran).toEqual(['update:a', 'insert:c'])
        expect(ordered.orderedIds()).toEqual(['c', 'a'])
    })

    it('removes before it inserts on an invoice at 250 lines', () => {
        const rows = Array.from({ length: MAX_DOCUMENT_LINES }, (_, i) =>
            item(`l${String(i).padStart(3, '0')}`, 1, '1.00')
        )
        const stored = storedRows(rows)
        // Replace the line at 10 with a new one in its place.
        const fresh = item('new', 1, '2.00')
        const plan: TableWritePlan = {
            insert: [{ row: fresh, position: 10 }],
            update: [],
            remove: ['l010'],
        }

        // Insert first: 251 lines are stored for a moment.
        const naive = runNaive(stored, [{ insert: plan.insert[0] }, { remove: 'l010' }])
        expect(naive.refusals).toContain('more than 250 lines')

        const ordered = runOrdered(stored, plan)
        expect(ordered.refusals).toEqual([])
        expect(ordered.ran).toEqual(['remove:l010', 'insert:new'])
        expect(ordered.store.size).toBe(MAX_DOCUMENT_LINES)
        expect(ordered.store.has('new')).toBe(true)
    })

    it('numbers each step by its row and gives a remove no number', () => {
        const a = item('a', 1, '10.00')
        const b = item('b', 1, '20.00')
        const stored = storedRows([a, b])
        const fake = server(stored)
        const steps = invoiceLineWriteSteps({
            storedLines: stored,
            plan: {
                insert: [{ row: item('c', 1, '5.00'), position: 1 }],
                update: [],
                remove: ['b'],
            },
            tax: TAX,
            ops: fake.ops,
        })
        expect(steps.map(step => step.itemNumber)).toEqual([null, 2])
    })
})
