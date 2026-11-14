// @vitest-environment happy-dom
import { validateDefinitionForHost } from '@tinycld/core/lib/forms/definition'
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { describe, expect, it } from 'vitest'
import { AMOUNT_COLUMN_WIDTH } from '../tinycld/books/forms/document-line-cells'
import hosts, { BILL_HOST_KEY, EXPENSE_HOST_KEY } from '../tinycld/books/forms/hosts'
import ui from '../tinycld/books/forms/ui'
import { floored } from '../tinycld/books/lib/document-line-columns'
import { EXPENSE_REF_HINT } from '../tinycld/books/lib/document-texts'
import { MEMO_HINT } from '../tinycld/books/lib/sales-document-kinds'

// The `books:expense` forms host (spec §3.3, §3.4, §4). The component-registration case
// comes with the components (checkpoint 3).

function parsedHost(key: string) {
    const host = hosts.find(h => h.key === key)
    if (!host) throw new Error(`no ${key} host in forms/hosts.ts`)
    return hostDefSchema.parse(host)
}

function expenseHost() {
    return parsedHost('books:expense')
}

function builtin(key: string) {
    const found = expenseHost().builtin.find(b => b.key === key)
    if (!found) throw new Error(`no built-in ${key}`)
    return found
}

function billBuiltin(key: string) {
    const found = parsedHost(BILL_HOST_KEY).builtin.find(b => b.key === key)
    if (!found) throw new Error(`no bill built-in ${key}`)
    return found
}

function column(tableKey: string, columnKey: string) {
    const found = builtin(tableKey).columns?.find(c => c.key === columnKey)
    if (!found) throw new Error(`no ${columnKey} column in ${tableKey}`)
    return found
}

const BAND = ['vendor', 'paid_from', 'date', 'payment_method', 'reference_no'] as const

describe('books:expense forms host', () => {
    it('parses on books_expenses, and its default form passes the host checks', () => {
        expect(EXPENSE_HOST_KEY).toBe('books:expense')
        const host = expenseHost()
        expect(host.collection).toBe('books_expenses')
        expect(validateDefinitionForHost(defaultDefinitionFor(host), host)).toEqual([])
    })

    it('declares the built-ins in order', () => {
        expect(expenseHost().builtin.map(b => b.key)).toEqual([
            'vendor',
            'paid_from',
            'date',
            'payment_method',
            'reference_no',
            'account_lines',
            'item_lines',
            'memo',
        ])
    })

    it('has no mailing address, terms, due date or message', () => {
        const keys = expenseHost().builtin.map(b => b.key)
        for (const key of ['mailing_address', 'terms', 'due_date', 'message']) {
            expect(keys, key).not.toContain(key)
        }
    })

    it('makes Vendor locked and optional, drawn by VendorField', () => {
        expect(builtin('vendor').locked).toBe(true)
        expect(builtin('vendor').required).toBe(false)
        expect(builtin('vendor').component).toBe('VendorField')
    })

    it('makes Paid from required and locked, drawn by PaymentAccountField', () => {
        expect(builtin('paid_from').required).toBe(true)
        expect(builtin('paid_from').locked).toBe(true)
        expect(builtin('paid_from').component).toBe('PaymentAccountField')
    })

    it('labels the date Payment date, required and locked', () => {
        expect(builtin('date').label).toBe('Payment date')
        expect(builtin('date').required).toBe(true)
        expect(builtin('date').locked).toBe(true)
    })

    it('makes Payment method required, drawn by RequiredPaymentMethodField', () => {
        expect(builtin('payment_method').required).toBe(true)
        expect(builtin('payment_method').component).toBe('RequiredPaymentMethodField')
    })

    it('makes Ref no. a text with the check or card hint and no host length bound', () => {
        const reference = builtin('reference_no')
        expect(reference.label).toBe('Ref no.')
        if (reference.kind !== 'text') throw new Error('Ref no. is not a text built-in')
        // The 40 bound and its text live in lib/document-schema.ts (the migration bounds the column), so core adds no second "is too long" text.
        expect(reference.maxLength).toBeUndefined()
        expect(EXPENSE_REF_HINT).toBe('Check number or card reference')
        const field = defaultDefinitionFor(expenseHost()).fields.find(f => f.key === 'reference_no')
        expect(field?.description).toBe('Check number or card reference')
    })

    it('does not require either line table, so either may be hidden', () => {
        expect(builtin('account_lines').required).toBe(false)
        expect(builtin('item_lines').required).toBe(false)
    })

    it('gives both line tables the bill’s row kinds, columns and keys', () => {
        for (const key of ['account_lines', 'item_lines']) {
            const table = builtin(key)
            const bill = billBuiltin(key)
            expect(table.kind, key).toBe('table')
            expect(table.label, key).toBe(bill.label)
            expect(table.rowKinds, key).toEqual(bill.rowKinds)
            expect(table.columns, key).toEqual(bill.columns)
            expect(table.rowShortcuts, key).toBe(true)
            expect(table.insertShortcuts, key).toEqual(bill.insertShortcuts)
        }
        expect(builtin('account_lines').rowKinds?.[0]).toMatchObject({
            key: 'account',
            shortcut: 'Alt+Enter',
            required: ['account', 'amount'],
        })
        expect(builtin('item_lines').rowKinds?.[0]).toMatchObject({
            key: 'item',
            shortcut: 'Alt+p',
            required: ['product'],
        })
    })

    it('sizes Amount the same in both tables, so the totals line up under it', () => {
        const size = floored(AMOUNT_COLUMN_WIDTH)
        expect(column('account_lines', 'amount')).toMatchObject(size)
        expect(column('item_lines', 'amount')).toMatchObject(size)
    })

    it('puts an admin’s custom fields before the line tables', () => {
        expect(expenseHost().insertCustomBefore).toBe('account_lines')
    })

    it('gives every band cell a third of the row, and the full row below 640 px', () => {
        const definition = defaultDefinitionFor(expenseHost())
        expect(definition.pages.map(p => p.title)).toEqual(['Expense'])
        const fields = Object.fromEntries(definition.fields.map(f => [f.key, f]))
        const placed = expenseHost().layout?.fields
        for (const key of BAND) {
            expect(fields[key]?.width, key).toBe('third')
            expect(fields[key]?.narrowWidth, key).toBe('full')
            expect(placed?.[key]?.width, key).toBe('third')
            expect(placed?.[key]?.narrowWidth, key).toBe('full')
        }
    })

    it('hints the memo as internal', () => {
        const memo = defaultDefinitionFor(expenseHost()).fields.find(f => f.key === 'memo')
        expect(memo?.description).toBe(MEMO_HINT)
        expect(MEMO_HINT).toBe('Only your team sees this. Saved as the journal entry memo.')
    })

    it('names only components the forms UI module provides', () => {
        const named = expenseHost().builtin.flatMap(b => [
            ...(b.component ? [b.component] : []),
            ...(b.columns ?? []).flatMap(c => (c.component ? [c.component] : [])),
        ])
        for (const name of [
            'VendorField',
            'PaymentAccountField',
            'DocumentDateField',
            'RequiredPaymentMethodField',
        ]) {
            expect(named, name).toContain(name)
        }
        for (const name of named) expect(ui.components[name], name).toBeDefined()
    })
})
