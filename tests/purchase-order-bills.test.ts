import { describe, expect, it } from 'vitest'
import {
    draftNoteText,
    linkedLineTexts,
    type OrderBill,
    orderBillsSummary,
} from '../tinycld/books/lib/purchase-order-bills'

// The bills of a purchase order (spec §3.6, §3.8): the Bills section's rows, what the
// draft bills hold of each order line, and the order lines a bill names.

function bill(over: Partial<OrderBill> & Pick<OrderBill, 'id'>): OrderBill {
    return {
        number: '',
        date: '2026-11-20',
        status: 'draft',
        currency: 'USD',
        replaced_by: '',
        replaces: '',
        lines: [],
        ...over,
    }
}

const line = (po_line: string, kind: 'item' | 'account', quantity: number, amount: number) => ({
    po_line,
    kind,
    quantity,
    amount,
})

describe('orderBillsSummary', () => {
    it('lists each bill that is not void, by date then number, with the amount of its lines from the order', () => {
        const summary = orderBillsSummary([
            bill({
                id: 'b2',
                number: '1008',
                date: '2026-11-22',
                status: 'posted',
                lines: [line('pl1', 'item', 3, 36_420), line('', 'account', 0, 2_000)],
            }),
            bill({ id: 'b1', date: '2026-11-21', lines: [line('pl2', 'account', 0, 12_000)] }),
            bill({
                id: 'b3',
                number: '1009',
                status: 'void',
                lines: [line('pl1', 'item', 1, 100)],
            }),
        ])
        expect(summary.rows).toEqual([
            {
                id: 'b1',
                number: 'Draft bill',
                date: '2026-11-21',
                amount: 12_000,
                currency: 'USD',
                status: { label: 'Draft', tone: expect.any(String) },
            },
            {
                id: 'b2',
                number: 'Bill 1008',
                date: '2026-11-22',
                amount: 36_420,
                currency: 'USD',
                status: { label: 'Posted', tone: expect.any(String) },
            },
        ])
    })

    it('gives the lines of the draft bills only, and every order line any bill names', () => {
        const summary = orderBillsSummary([
            bill({ id: 'd', lines: [line('pl1', 'item', 4, 48_560), line('', 'item', 1, 10)] }),
            bill({ id: 'p', status: 'posted', lines: [line('pl2', 'account', 0, 5_000)] }),
            bill({ id: 'v', status: 'void', lines: [line('pl3', 'account', 0, 7_000)] }),
        ])
        expect(summary.draftLines).toEqual([{ po_line: 'pl1', quantity: 4, amount: 48_560 }])
        expect([...summary.linkedLines].sort()).toEqual(['pl1', 'pl2', 'pl3'])
        expect(summary.hasBills).toBe(true)
    })

    // Spec §3.6: the Bills section lists each bill "not void and not replaced". A correction
    // replaces a posted bill, which stays posted with `replaced_by` set (the server counts only
    // COALESCE(b.replaced_by, '') = '': server/purchase_order_receipts.go).
    it('leaves out a bill a correction replaced and lists the correction, keeping both bills lines linked', () => {
        const summary = orderBillsSummary([
            bill({
                id: 'orig',
                number: '1012',
                status: 'posted',
                replaced_by: 'corr',
                lines: [line('pl1', 'item', 4, 48_560)],
            }),
            bill({
                id: 'corr',
                number: '1012',
                date: '2026-11-21',
                status: 'posted',
                replaces: 'orig',
                lines: [line('pl2', 'account', 0, 12_000)],
            }),
        ])
        expect(summary.rows.map(row => row.id)).toEqual(['corr'])
        expect([...summary.linkedLines].sort()).toEqual(['pl1', 'pl2'])
    })

    // A draft correction keeps `po_line` on its lines (hooks/document-data.ts "correction
    // draft"); what it holds is already on the posted original, so it is not held twice.
    it('does not count the lines of a draft correction as held by a draft bill', () => {
        const summary = orderBillsSummary([
            bill({
                id: 'orig',
                number: '1012',
                status: 'posted',
                lines: [line('pl1', 'item', 4, 48_560)],
            }),
            bill({
                id: 'corr',
                status: 'draft',
                replaces: 'orig',
                lines: [line('pl1', 'item', 4, 48_560)],
            }),
            bill({ id: 'd', lines: [line('pl2', 'account', 0, 5_000)] }),
        ])
        expect(summary.draftLines).toEqual([{ po_line: 'pl2', quantity: 0, amount: 5_000 }])
    })

    it('has no rows, no drafts and no linked lines with no bill', () => {
        const summary = orderBillsSummary([])
        expect(summary.rows).toEqual([])
        expect(summary.draftLines).toEqual([])
        expect(summary.linkedLines.size).toBe(0)
        expect(summary.hasBills).toBe(false)
    })
})

describe('linkedLineTexts', () => {
    const lines = [
        { id: 'pl1', kind: 'item', quantity: 10, amount: 121_400, received: 4, billed: 48_560 },
        { id: 'pl2', kind: 'account', quantity: 0, amount: 30_000, received: 0, billed: 12_000 },
        { id: 'pl3', kind: 'account', quantity: 0, amount: 5_000, received: 0, billed: 0 },
        { id: 'pl4', kind: 'item', quantity: 2, amount: 620, received: 0, billed: 0 },
    ]

    it('words each line a bill names, on a draft bill too, and no other', () => {
        expect(linkedLineTexts(lines, new Set(['pl1', 'pl2', 'pl4']), 'USD')).toEqual({
            pl1: 'Received 4 of 10',
            pl2: 'Billed $120.00 of $300.00',
            pl4: 'Received 0 of 2',
        })
    })

    it('takes the lines that posted bills received or billed while the bills are not read', () => {
        expect(linkedLineTexts(lines, null, 'USD')).toEqual({
            pl1: 'Received 4 of 10',
            pl2: 'Billed $120.00 of $300.00',
        })
    })
})

describe('draftNoteText', () => {
    const drafts = [
        { po_line: 'pl1', quantity: 4, amount: 48_560 },
        { po_line: 'pl1', quantity: 0.5, amount: 6_070 },
        { po_line: 'pl2', quantity: 0, amount: 12_000 },
    ]

    it('words what the drafts hold of a product line as a quantity', () => {
        expect(draftNoteText({ id: 'pl1', kind: 'item' }, drafts, 'USD')).toBe(
            '4.5 on a draft bill'
        )
    })

    it('words what the drafts hold of an account line as money', () => {
        expect(draftNoteText({ id: 'pl2', kind: 'account' }, drafts, 'USD')).toBe(
            '$120.00 on a draft bill'
        )
    })

    it('is empty for a line no draft holds', () => {
        expect(draftNoteText({ id: 'pl3', kind: 'item' }, drafts, 'USD')).toBe('')
    })
})
