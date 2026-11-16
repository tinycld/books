import { shortDay } from '@tinycld/core/reports/lib/dates'
import { describe, expect, it } from 'vitest'
import {
    type AuditField,
    type AuditFieldRow,
    auditFieldsOf,
    changedFieldRows,
    fieldValueText,
} from '../tinycld/books/lib/audit-fields'
import { formatMoney } from '../tinycld/books/lib/money'

const USD = { currency: 'USD' }

const TEXT: AuditField = { label: 'Memo', kind: 'text' }
const MONEY: AuditField = { label: 'Amount', kind: 'money' }
const DAY: AuditField = { label: 'Due date', kind: 'day' }
const BOOL: AuditField = { label: 'Inactive', kind: 'bool' }
const RELATION: AuditField = { label: 'Account', kind: 'relation', target: 'books_accounts' }
const HIDDEN: AuditField = { label: 'Tax ID', kind: 'hidden' }

// A field of the real map, so a select reads the labels Books shows.
function fieldOf(collection: string, key: string): AuditField {
    const field = auditFieldsOf(collection)[key]
    if (!field) throw new Error(`no audit field ${collection}.${key}`)
    return field
}

// What a table row shows in its Before and After cells.
function cells(row: AuditFieldRow) {
    return {
        label: row.label,
        before: fieldValueText(row.field, row.before, USD),
        after: fieldValueText(row.field, row.after, USD),
    }
}

describe('fieldValueText', () => {
    it('writes money cents in the Books currency', () => {
        const text = fieldValueText(MONEY, 125000, USD)
        expect(text).toBe(formatMoney(125000, 'USD'))
        expect(text).toContain('1,250.00')
    })

    it('writes a day as core’s short day', () => {
        expect(fieldValueText(DAY, '2026-11-14', USD)).toBe(shortDay('2026-11-14'))
    })

    it('writes a yes/no as Yes or No', () => {
        expect(fieldValueText(BOOL, true, USD)).toBe('Yes')
        expect(fieldValueText(BOOL, false, USD)).toBe('No')
    })

    it('writes a select value by its label', () => {
        const status = fieldOf('books_invoices', 'status')
        expect(status.kind).toBe('select')
        expect(fieldValueText(status, 'posted', USD)).toBe('Posted')
        expect(fieldValueText(status, 'draft', USD)).toBe('Draft')
    })

    it('names a related record by its current name, or Removed record', () => {
        expect(
            fieldValueText(RELATION, 'bkacct00savings', {
                currency: 'USD',
                relationName: '1010 Business Savings',
            })
        ).toBe('1010 Business Savings')
        expect(
            fieldValueText(RELATION, 'bkacct00savings', { currency: 'USD', relationName: null })
        ).toBe('Removed record')
    })

    it('writes an empty value as Empty', () => {
        for (const value of ['', null, undefined]) {
            expect(fieldValueText(TEXT, value, USD), String(value)).toBe('Empty')
        }
        // An empty relation names no record, so it is not a removed one.
        expect(fieldValueText(RELATION, '', { currency: 'USD', relationName: null })).toBe('Empty')
    })

    it('writes a hidden field as Changed (hidden)', () => {
        expect(fieldValueText(HIDDEN, '12-3456789', USD)).toBe('Changed (hidden)')
        expect(fieldValueText(HIDDEN, '', USD)).toBe('Changed (hidden)')
    })

    it('passes a text value through', () => {
        expect(fieldValueText(TEXT, 'Desk lamps', USD)).toBe('Desk lamps')
    })
})

describe('changedFieldRows', () => {
    it('lists a product rename as Name alone: the name and sort keys are internal', () => {
        const rows = changedFieldRows('books_products', {
            name: { before: 'Desk lamp', after: 'Reading lamp' },
            name_key: { before: 'desk lamp', after: 'reading lamp' },
            sort_key: { before: 'desk lamp', after: 'reading lamp' },
        })
        expect(rows.map(cells)).toEqual([
            { label: 'Name', before: 'Desk lamp', after: 'Reading lamp' },
        ])
    })

    // HistoryEvent draws an empty list as "No visible fields changed". The same keys beside
    // a visible one leave that one row, so the empty list is the internal keys' doing.
    it('returns no row when only internal keys changed', () => {
        const internal = {
            sort_key: { before: 'a', after: 'b' },
            name_key: { before: 'a', after: 'b' },
            fields: { before: '{}', after: '{"rooms":"3"}' },
        }
        const withPhone = changedFieldRows('books_customers', {
            ...internal,
            phone: { before: '', after: '(503) 555-0144' },
        })
        expect(withPhone.map(row => row.key)).toEqual(['phone'])
        expect(changedFieldRows('books_customers', internal)).toEqual([])
    })

    it('keeps a hidden field as Changed (hidden) in both columns', () => {
        const rows = changedFieldRows('books_vendors', {
            tax_id: { before: '', after: '12-3456789' },
        })
        expect(rows.map(row => [row.key, cells(row).before, cells(row).after])).toEqual([
            ['tax_id', 'Changed (hidden)', 'Changed (hidden)'],
        ])
    })

    it('writes a change core redacted as Changed (hidden), whatever its field', () => {
        const rows = changedFieldRows('books_estimates', {
            public_token: { before: '[redacted]', after: '[redacted]', redacted: true },
            memo: { before: '[redacted]', after: '[redacted]', redacted: true },
        })
        const shown = rows.map(row => [row.key, cells(row).before, cells(row).after])
        expect(shown).toHaveLength(2)
        expect(shown).toEqual(
            expect.arrayContaining([
                ['public_token', 'Changed (hidden)', 'Changed (hidden)'],
                ['memo', 'Changed (hidden)', 'Changed (hidden)'],
            ])
        )
    })

    it('writes each value by its field’s rule', () => {
        const rows = changedFieldRows('books_invoices', {
            status: { before: 'draft', after: 'posted' },
            due_date: { before: '2026-12-14', after: '2026-12-29' },
        })
        const shown = rows.map(cells)
        expect(shown).toHaveLength(2)
        expect(shown).toEqual(
            expect.arrayContaining([
                { label: 'Status', before: 'Draft', after: 'Posted' },
                {
                    label: 'Due date',
                    before: shortDay('2026-12-14'),
                    after: shortDay('2026-12-29'),
                },
            ])
        )
    })
})
