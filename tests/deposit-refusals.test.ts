import { ClientResponseError } from 'pocketbase'
import type { FieldErrors } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import {
    depositRefusalErrors,
    depositRefusals,
    itemErrorsAfterTicks,
} from '../tinycld/books/lib/deposit-refusals'
import type { DepositFormValues } from '../tinycld/books/lib/deposit-values'

// Where a refused deposit save shows (bank deposit spec §3.7, Refusal keys): `deposit_to`
// and `date` under those fields; `items.<n>` (the server's 0-based rank among the stored
// items in position order) under the form row of that item's line; `lines.<n>.<field>`
// under that line's field; any other key, and an `items.<n>` whose item is not ticked, in
// the form's summary (the root).

// Stored positions with a gap, out of rank order: rank 0 is L2 (position 1), rank 1 is L1
// (position 4), rank 2 is L3 (position 7).
const STORED = [
    { line: 'deplinestored01', position: 4 },
    { line: 'deplinestored02', position: 1 },
    { line: 'deplinestored03', position: 7 },
]

// The form's ticked rows: L2 was unticked, so L1 is the form's row 0 and L3 its row 1.
const TICKED = [{ line: 'deplinestored01' }, { line: 'deplinestored03' }]

function refusal(data: Record<string, string>, message = 'Failed to update record.') {
    const fields = Object.fromEntries(
        Object.entries(data).map(([key, text]) => [
            key,
            { code: 'validation_refused', message: text },
        ])
    )
    return new ClientResponseError({
        status: 400,
        response: { status: 400, message, data: fields },
    })
}

describe('depositRefusals', () => {
    it('puts deposit_to and date under those fields', () => {
        const error = refusal({
            deposit_to: 'Pick a bank account.',
            date: 'Enter a real day.',
        })
        expect(depositRefusals(error, STORED, TICKED)).toEqual([
            { field: 'deposit_to', message: 'Pick a bank account.' },
            { field: 'date', message: 'Enter a real day.' },
        ])
    })

    it('puts items.<n> under the form row of the item that ranks n among the stored items', () => {
        // Rank 1 is L1, the form's row 0; rank 2 is L3, the form's row 1.
        const error = refusal({
            'items.1': 'Sales receipt 1004 is void.',
            'items.2': 'Payment 1007 is already in Deposit 1002.',
        })
        expect(depositRefusals(error, STORED, TICKED)).toEqual([
            { field: 'items.0.root', message: 'Sales receipt 1004 is void.' },
            { field: 'items.1.root', message: 'Payment 1007 is already in Deposit 1002.' },
        ])
    })

    it('puts items.<n> in the summary when that item has no ticked row', () => {
        // Rank 0 is L2, which the form no longer ticks; rank 9 names no stored item.
        const error = refusal({
            'items.0': 'Payment 1004 is void.',
            'items.9': 'Payment 1010 is void.',
        })
        expect(depositRefusals(error, STORED, TICKED)).toEqual([
            { field: 'root', message: 'Payment 1004 is void. Payment 1010 is void.' },
        ])
    })

    it('puts lines.<n>.<field> under that line field', () => {
        const error = refusal({
            'lines.0.account': 'This account is inactive.',
            'lines.2.amount': 'Enter an amount other than 0',
        })
        expect(depositRefusals(error, STORED, TICKED)).toEqual([
            { field: 'lines.0.account', message: 'This account is inactive.' },
            { field: 'lines.2.amount', message: 'Enter an amount other than 0' },
        ])
    })

    it('puts an unknown key in the summary next to the placed ones', () => {
        const error = refusal({
            sequence: 'The deposit number is taken.',
            date: 'Enter a real day.',
        })
        expect(depositRefusals(error, STORED, TICKED)).toEqual([
            { field: 'date', message: 'Enter a real day.' },
            { field: 'root', message: 'The deposit number is taken.' },
        ])
    })

    it('puts a message-only refusal in the summary', () => {
        const error = new ClientResponseError({
            status: 400,
            response: {
                status: 400,
                message: 'The deposit date is on or before the close date.',
                data: {},
            },
        })
        expect(depositRefusals(error, STORED, TICKED)).toEqual([
            { field: 'root', message: 'The deposit date is on or before the close date.' },
        ])
    })
})

describe('depositRefusalErrors', () => {
    it('gives the nested form errors a handed-off draft starts with', () => {
        const error = refusal({ 'items.2': 'Payment 1007 is void.', date: 'Enter a real day.' })
        expect(depositRefusalErrors(error, STORED, TICKED)).toEqual({
            items: [undefined, { root: { type: 'server', message: 'Payment 1007 is void.' } }],
            date: { type: 'server', message: 'Enter a real day.' },
        })
    })
})

// The form's item errors with a server refusal on each of the given rows.
function rowErrors(messages: (string | undefined)[]) {
    const errors: FieldErrors<DepositFormValues> = {
        items: messages.map(message =>
            message === undefined ? undefined : { root: { type: 'server', message } }
        ),
    }
    return errors.items
}

describe('itemErrorsAfterTicks', () => {
    it('moves a row error to the new index of its line', () => {
        // L2 is ticked again ahead of L1, so L1 moves from row 0 to row 1 and L3 from 1 to 2.
        const errors = rowErrors(['Sales receipt 1004 is void.', 'Payment 1007 is void.'])
        const next = [
            { line: 'deplinestored02' },
            { line: 'deplinestored01' },
            { line: 'deplinestored03' },
        ]
        expect(itemErrorsAfterTicks(errors, TICKED, next)).toEqual([
            {
                field: 'items.1.root',
                error: { type: 'server', message: 'Sales receipt 1004 is void.' },
            },
            { field: 'items.2.root', error: { type: 'server', message: 'Payment 1007 is void.' } },
        ])
    })

    it('drops the error of a row that is no longer ticked', () => {
        const errors = rowErrors(['Sales receipt 1004 is void.', 'Payment 1007 is void.'])
        expect(itemErrorsAfterTicks(errors, TICKED, [{ line: 'deplinestored03' }])).toEqual([
            { field: 'items.0.root', error: { type: 'server', message: 'Payment 1007 is void.' } },
        ])
    })

    it('gives a newly ticked row no error', () => {
        // Only L3 (row 1) has an error; L2 is newly ticked into row 0, and L1 has none.
        const errors = rowErrors([undefined, 'Payment 1007 is void.'])
        const next = [
            { line: 'deplinestored02' },
            { line: 'deplinestored01' },
            { line: 'deplinestored03' },
        ]
        expect(itemErrorsAfterTicks(errors, TICKED, next)).toEqual([
            { field: 'items.2.root', error: { type: 'server', message: 'Payment 1007 is void.' } },
        ])
    })

    it('gives null when no row has an error', () => {
        expect(itemErrorsAfterTicks(undefined, TICKED, [{ line: 'deplinestored01' }])).toBeNull()
        expect(
            itemErrorsAfterTicks(rowErrors([undefined, undefined]), TICKED, [
                { line: 'deplinestored02' },
            ])
        ).toBeNull()
    })
})
