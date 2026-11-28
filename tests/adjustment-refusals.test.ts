import { ClientResponseError } from 'pocketbase'
import { describe, expect, it } from 'vitest'
import {
    adjustmentRefusalHandler,
    adjustmentRefusals,
} from '../tinycld/books/lib/adjustment-refusals'
import { SERVER_UNREACHED } from '../tinycld/books/lib/refusal'

// Where a refused inventory adjustment save shows (inventory-adjust spec §3.3): "Line n: …"
// on line n as that line's root error, by the stored line's row id (the form may hold blank
// lines the save left out); a header field's refusal under its field; a field of one
// line's own write under that line's input; anything else in the form's error summary.

// The form holds a blank line between two lines; the save wrote the two lines only.
const FORM_LINES = [{ id: 'ialnform0000001' }, { id: 'ialnblank000001' }, { id: 'ialnform0000002' }]
const SAVED = [{ id: 'ialnform0000001' }, { id: 'ialnform0000002' }]
const PLACE = { saved: SAVED, formLines: FORM_LINES }

function fieldRefusal(data: Record<string, string>, message = 'Failed to update record.') {
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

function messageRefusal(message: string) {
    return new ClientResponseError({ status: 400, response: { status: 400, message, data: {} } })
}

describe('adjustmentRefusals', () => {
    it('puts "Line n: …" on the form line of the n-th saved line, with the server’s text', () => {
        const error = messageRefusal('Line 2: A quantity increase cannot have a value below 0.')
        expect(adjustmentRefusals(error, PLACE)).toEqual([
            {
                field: 'lines.2.root',
                message: 'Line 2: A quantity increase cannot have a value below 0.',
            },
        ])
    })

    it('puts a "Line n" the form no longer holds in the summary', () => {
        const error = messageRefusal('Line 3: Choose an Inventory item.')
        expect(adjustmentRefusals(error, PLACE)).toEqual([
            { field: 'root', message: 'Line 3: Choose an Inventory item.' },
        ])
    })

    it('puts the header fields under their fields', () => {
        const error = fieldRefusal({
            account:
                'Choose an adjustment account other than Accounts receivable or Accounts payable.',
            date: 'The books are closed through June 30, 2026. Choose a later date.',
        })
        expect(adjustmentRefusals(error, PLACE)).toEqual([
            {
                field: 'account',
                message:
                    'Choose an adjustment account other than Accounts receivable or Accounts payable.',
            },
            {
                field: 'date',
                message: 'The books are closed through June 30, 2026. Choose a later date.',
            },
        ])
    })

    it('puts a field of one line’s own write under that line’s input, its quantity under Change', () => {
        const error = fieldRefusal({
            quantity: 'Enter a quantity with at most 2 decimals.',
            product: 'Choose an Inventory item.',
            bin: 'A value change has no bin.',
        })
        expect(adjustmentRefusals(error, { ...PLACE, lineAt: 1 })).toEqual([
            { field: 'lines.2.change', message: 'Enter a quantity with at most 2 decimals.' },
            { field: 'lines.2.product', message: 'Choose an Inventory item.' },
            { field: 'lines.2.bin', message: 'A value change has no bin.' },
        ])
    })

    it('puts a field the form does not draw in the summary, beside the placed ones', () => {
        const error = fieldRefusal({
            memo: 'The memo is too long.',
            value_change: 'Books keeps this value.',
        })
        expect(adjustmentRefusals(error, PLACE)).toEqual([
            { field: 'memo', message: 'The memo is too long.' },
            { field: 'root', message: 'Books keeps this value.' },
        ])
    })

    it('puts a message that numbers no line in the summary', () => {
        const error = messageRefusal('A posted or void inventory adjustment cannot be changed.')
        expect(adjustmentRefusals(error, PLACE)).toEqual([
            { field: 'root', message: 'A posted or void inventory adjustment cannot be changed.' },
        ])
    })

    it('puts a write that reached no server in the summary with the fixed text', () => {
        const error = new ClientResponseError({ status: 0, response: {} })
        expect(adjustmentRefusals(error, PLACE)).toEqual([
            { field: 'root', message: SERVER_UNREACHED },
        ])
    })
})

describe('adjustmentRefusalHandler', () => {
    it('sets each placed refusal on the form as a server error', () => {
        const set: { name: string; error: { type: string; message: string } }[] = []
        const form = {
            setError: (name: string, error: { type: string; message: string }) =>
                set.push({ name, error }),
        }
        adjustmentRefusalHandler(form, PLACE)(messageRefusal('Line 1: A value change has no bin.'))
        expect(set).toEqual([
            {
                name: 'lines.0.root',
                error: { type: 'server', message: 'Line 1: A value change has no bin.' },
            },
        ])
    })
})
