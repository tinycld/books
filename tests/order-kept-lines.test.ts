import type { FormHostUi } from '@tinycld/core/lib/forms/host-ui'
import { describe, expect, it } from 'vitest'
import { withKeptOrderLines } from '../tinycld/books/lib/purchase-order-bills'

// A purchase order line that a bill line names is kept in the order form (spec §3.8 "Its
// row menu has no Remove"; the human, 2026-11-26: no Duplicate either). Core reads the
// host UI's canRemoveRow for the row menu and the row keys.

const UI: FormHostUi = { components: {} }

describe('withKeptOrderLines', () => {
    it('keeps the host UI as it is when no line is linked', () => {
        expect(withKeptOrderLines(UI, {})).toBe(UI)
        expect(withKeptOrderLines(null, { line1: 'Received 4 of 10' })).toBeNull()
    })

    it('keeps a linked line in each table and lets every other line go', () => {
        const ui = withKeptOrderLines(UI, {
            line1: 'Received 4 of 10',
            line2: 'Billed $1.00 of $3.00',
        })
        const canRemoveRow = ui?.canRemoveRow
        expect(canRemoveRow).toBeDefined()
        expect(canRemoveRow?.('item_lines', { id: 'line1' })).toBe(false)
        expect(canRemoveRow?.('account_lines', { id: 'line2' })).toBe(false)
        expect(canRemoveRow?.('account_lines', { id: 'line3' })).toBe(true)
        expect(ui?.components).toBe(UI.components)
    })
})
