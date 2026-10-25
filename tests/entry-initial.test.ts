import { describe, expect, it } from 'vitest'
import { entryInitialValues } from '../tinycld/books/lib/entry-initial'
import { amountText } from '../tinycld/books/lib/money'
import type { BooksJournalEntries, BooksJournalLines } from '../tinycld/books/types'

const NOW = '2026-10-01 00:00:00.000Z'

const entry: Pick<BooksJournalEntries, 'date' | 'memo' | 'auto_reverse_on'> = {
    date: '2026-10-12',
    memo: 'Accrue wages',
    auto_reverse_on: '2026-11-01',
}

function row(id: string, position: number, over: Partial<BooksJournalLines>): BooksJournalLines {
    return {
        id,
        entry: 'je_1',
        account: 'acct_a',
        debit: 0,
        credit: 0,
        memo: '',
        position,
        posted: false,
        date: entry.date,
        currency: 'USD',
        created: NOW,
        updated: NOW,
        ...over,
    }
}

describe('entryInitialValues', () => {
    it('copies the header fields and renames auto_reverse_on', () => {
        expect(entryInitialValues(entry, [], 'USD')).toEqual({
            date: '2026-10-12',
            memo: 'Accrue wages',
            autoReverseOn: '2026-11-01',
            lines: [],
        })
    })

    it('keeps an empty auto-reverse date as an empty string', () => {
        const values = entryInitialValues({ ...entry, auto_reverse_on: '' }, [], 'USD')
        expect(values.autoReverseOn).toBe('')
    })

    it('puts lines in position order and keeps their saved ids', () => {
        const values = entryInitialValues(
            entry,
            [
                row('l3', 2, { account: 'acct_c', credit: 300 }),
                row('l1', 0, { account: 'acct_a', debit: 1000 }),
                row('l2', 1, { account: 'acct_b', credit: 700, memo: 'part' }),
            ],
            'USD'
        )
        expect(values.lines.map(l => l.id)).toEqual(['l1', 'l2', 'l3'])
        expect(values.lines.map(l => l.account)).toEqual(['acct_a', 'acct_b', 'acct_c'])
        expect(values.lines[1].memo).toBe('part')
    })

    it('orders lines with equal positions by id, whatever order they arrive in', () => {
        const a = row('a', 0, {})
        const b = row('b', 0, {})
        const c = row('c', 1, {})
        const forward = entryInitialValues(entry, [a, b, c], 'USD')
        const reversed = entryInitialValues(entry, [c, b, a], 'USD')
        expect(forward.lines.map(l => l.id)).toEqual(['a', 'b', 'c'])
        expect(reversed.lines.map(l => l.id)).toEqual(['a', 'b', 'c'])
    })

    it('formats each side with amountText and leaves a zero side as a blank string', () => {
        const values = entryInitialValues(
            entry,
            [row('l1', 0, { debit: 1000 }), row('l2', 1, { credit: 1050 })],
            'USD'
        )
        expect(values.lines[0]).toMatchObject({
            debit: amountText(1000, 'USD'),
            credit: '',
        })
        expect(values.lines[1]).toMatchObject({
            debit: '',
            credit: amountText(1050, 'USD'),
        })
        expect(values.lines[0].debit).not.toBe('')
    })

    it('formats amounts in the given currency', () => {
        const values = entryInitialValues(entry, [row('l1', 0, { debit: 123456 })], 'JPY')
        expect(values.lines[0].debit).toBe(amountText(123456, 'JPY'))
    })

    it('does not change the rows it is given', () => {
        const rows = [row('l2', 1, { credit: 5 }), row('l1', 0, { debit: 5 })]
        entryInitialValues(entry, rows, 'USD')
        expect(rows.map(r => r.id)).toEqual(['l2', 'l1'])
    })
})
