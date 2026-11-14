// @vitest-environment happy-dom
import { validateDefinitionForHost } from '@tinycld/core/lib/forms/definition'
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { describe, expect, it } from 'vitest'
import {
    MailingAddressField,
    VendorField,
    VendorRefField,
} from '../tinycld/books/forms/document-fields'
import { AMOUNT_COLUMN_WIDTH } from '../tinycld/books/forms/document-line-cells'
import hosts, { BILL_HOST_KEY } from '../tinycld/books/forms/hosts'
import {
    LineAccountCell,
    LineItemAmountCell,
    LinePurchaseProductCell,
    LineTypedAmountCell,
} from '../tinycld/books/forms/purchase-line-cells'
import ui from '../tinycld/books/forms/ui'
import { floored } from '../tinycld/books/lib/document-line-columns'
import {
    ACCOUNT_ROW_KIND,
    BILL_ACCOUNT_COLUMNS,
    PURCHASE_ITEM_COLUMNS,
    PURCHASE_ITEM_ROW_KIND,
} from '../tinycld/books/lib/purchase-line-columns'

// The `books:bill` forms host (spec §3.3, §3.4).

function billHost() {
    const host = hosts.find(h => h.key === BILL_HOST_KEY)
    if (!host) throw new Error('no books:bill host in forms/hosts.ts')
    return hostDefSchema.parse(host)
}

function builtin(key: string) {
    const found = billHost().builtin.find(b => b.key === key)
    if (!found) throw new Error(`no built-in ${key}`)
    return found
}

function column(tableKey: string, columnKey: string) {
    const found = builtin(tableKey).columns?.find(c => c.key === columnKey)
    if (!found) throw new Error(`no ${columnKey} column in ${tableKey}`)
    return found
}

describe('books:bill forms host', () => {
    it('parses on books_bills, and its default form passes the host checks', () => {
        expect(BILL_HOST_KEY).toBe('books:bill')
        const host = billHost()
        expect(host.collection).toBe('books_bills')
        expect(validateDefinitionForHost(defaultDefinitionFor(host), host)).toEqual([])
    })

    it('declares the built-ins in order', () => {
        expect(billHost().builtin.map(b => b.key)).toEqual([
            'vendor',
            'mailing_address',
            'terms',
            'date',
            'due_date',
            'ref_no',
            'account_lines',
            'item_lines',
            'memo',
        ])
    })

    // The 40-character bound is the bill schema's (tests/document-schema-bill.test.ts).
    it('labels Bill date and Vendor’s bill no.', () => {
        expect(builtin('date').label).toBe('Bill date')
        expect(builtin('ref_no').label).toBe("Vendor's bill no.")
    })

    it('makes Vendor and Bill date required and locked, Due date required and Terms locked', () => {
        for (const key of ['vendor', 'date']) {
            expect(builtin(key).required, key).toBe(true)
            expect(builtin(key).locked, key).toBe(true)
        }
        expect(builtin('due_date').required).toBe(true)
        expect(builtin('terms').locked).toBe(true)
    })

    // A required built-in cannot be hidden, and the form hides the table the Bill lines
    // setting leaves out.
    it('does not require either line table, so either may be hidden', () => {
        expect(builtin('account_lines').required).toBe(false)
        expect(builtin('item_lines').required).toBe(false)
    })

    it('puts an admin’s custom fields before the line tables', () => {
        expect(billHost().insertCustomBefore).toBe('account_lines')
    })

    it('draws the header with the bill’s Books components', () => {
        const custom = Object.fromEntries(
            billHost()
                .builtin.filter(b => b.kind === 'custom')
                .map(b => [b.key, b.component])
        )
        expect(custom).toMatchObject({
            vendor: 'VendorField',
            mailing_address: 'MailingAddressField',
            terms: 'DocumentTermsField',
            date: 'DocumentDateField',
            due_date: 'DueDateField',
        })
        expect(builtin('ref_no').component).toBe('VendorRefField')
    })

    it('gives Account details one account row kind, keyed ⌥↵, added by "Add account line"', () => {
        const table = builtin('account_lines')
        expect(table.kind).toBe('table')
        expect(table.rowShortcuts).toBe(true)
        expect(table.rowKinds).toEqual([ACCOUNT_ROW_KIND])
        expect(table.rowKinds?.[0]).toMatchObject({
            key: 'account',
            shortcut: 'Alt+Enter',
            addLabel: 'Add account line',
            required: ['account', 'amount'],
        })
        expect(table.insertShortcuts).toEqual({ below: 'Alt+Enter' })
        expect(table.columns?.map(c => c.key)).toEqual(['account', 'description', 'amount'])
        expect(table.columns).toEqual(BILL_ACCOUNT_COLUMNS)
    })

    it('gives Product and service details one item row kind, keyed ⌥P, added by "Add product line"', () => {
        const table = builtin('item_lines')
        expect(table.kind).toBe('table')
        expect(table.rowShortcuts).toBe(true)
        expect(table.rowKinds).toEqual([PURCHASE_ITEM_ROW_KIND])
        expect(table.rowKinds?.[0]).toMatchObject({
            key: 'item',
            shortcut: 'Alt+p',
            addLabel: 'Add product line',
            required: ['product'],
        })
        expect(table.insertShortcuts).toEqual({ below: 'Alt+p' })
        expect(table.columns?.map(c => c.key)).toEqual([
            'product',
            'description',
            'quantity',
            'rate',
            'amount',
        ])
        expect(table.columns).toEqual(PURCHASE_ITEM_COLUMNS)
    })

    it('sizes Amount the same in both tables, so the totals line up under it', () => {
        const size = floored(AMOUNT_COLUMN_WIDTH)
        expect(column('account_lines', 'amount')).toMatchObject(size)
        expect(column('item_lines', 'amount')).toMatchObject(size)
    })

    it('adds a line on Enter in the account Amount and in the product Rate', () => {
        expect(column('account_lines', 'amount').addOnSubmit).toBe(true)
        expect(column('item_lines', 'rate').addOnSubmit).toBe(true)
    })

    it('names only components the forms UI module provides, the bill’s included', () => {
        const host = billHost()
        const named = host.builtin.flatMap(b => [
            ...(b.component ? [b.component] : []),
            ...(b.columns ?? []).flatMap(c => (c.component ? [c.component] : [])),
        ])
        for (const name of named) expect(ui.components[name], name).toBeDefined()
        expect(ui.components.VendorField).toBe(VendorField)
        expect(ui.components.MailingAddressField).toBe(MailingAddressField)
        expect(ui.components.VendorRefField).toBe(VendorRefField)
        expect(ui.components.LineAccountCell).toBe(LineAccountCell)
        expect(ui.components.LinePurchaseProductCell).toBe(LinePurchaseProductCell)
        expect(ui.components.LineTypedAmountCell).toBe(LineTypedAmountCell)
        expect(ui.components.LineItemAmountCell).toBe(LineItemAmountCell)
        expect(column('account_lines', 'account').component).toBe('LineAccountCell')
        expect(column('account_lines', 'amount').component).toBe('LineTypedAmountCell')
        expect(column('item_lines', 'product').component).toBe('LinePurchaseProductCell')
        expect(column('item_lines', 'amount').component).toBe('LineItemAmountCell')
    })

    it('puts Vendor and Mailing address on halves and Terms to the bill no. on quarters', () => {
        const definition = defaultDefinitionFor(billHost())
        expect(definition.pages.map(p => p.title)).toEqual(['Bill'])
        const widths = Object.fromEntries(definition.fields.map(f => [f.key, f.width]))
        expect(widths).toMatchObject({
            vendor: 'half',
            mailing_address: 'half',
            terms: 'quarter',
            date: 'quarter',
            due_date: 'quarter',
            ref_no: 'quarter',
        })
        const fields = Object.fromEntries(definition.fields.map(f => [f.key, f]))
        expect(fields.ref_no?.description).toBe("The number on the vendor's bill")
        expect(fields.memo?.description).toBe(
            'Only your team sees this. Saved as the journal entry memo.'
        )
    })
})
