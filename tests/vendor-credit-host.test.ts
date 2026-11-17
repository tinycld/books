// @vitest-environment happy-dom
import { validateDefinitionForHost } from '@tinycld/core/lib/forms/definition'
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { describe, expect, it } from 'vitest'
import { AMOUNT_COLUMN_WIDTH } from '../tinycld/books/forms/document-line-cells'
import hosts, {
    BILL_HOST_KEY,
    VENDOR_CREDIT_HOST_KEY,
    VENDOR_CREDIT_LAYOUT,
} from '../tinycld/books/forms/hosts'
import ui from '../tinycld/books/forms/ui'
import { floored } from '../tinycld/books/lib/document-line-columns'
import { VENDOR_CREDIT_REF_HINT } from '../tinycld/books/lib/document-texts'
import { MEMO_HINT } from '../tinycld/books/lib/sales-document-kinds'
import type { BooksVendorCredits } from '../tinycld/books/types'
import { fieldMax, migrationField } from './migration-field'

// The `books:vendor_credit` forms host (vendor credit spec §3.3, §3.4, §4).

function parsedHost(key: string) {
    const host = hosts.find(h => h.key === key)
    if (!host) throw new Error(`no ${key} host in forms/hosts.ts`)
    return hostDefSchema.parse(host)
}

const creditHost = () => parsedHost(VENDOR_CREDIT_HOST_KEY)

function builtinOf(key: string, host = creditHost()) {
    const found = host.builtin.find(b => b.key === key)
    if (!found) throw new Error(`no built-in ${key}`)
    return found
}

function column(tableKey: string, columnKey: string) {
    const found = builtinOf(tableKey).columns?.find(c => c.key === columnKey)
    if (!found) throw new Error(`no ${columnKey} column in ${tableKey}`)
    return found
}

// Every column of books_vendor_credits. `satisfies` fails the type check when the
// generated type gains or loses a column this list does not name.
const CREDIT_COLUMNS = {
    id: true,
    vendor: true,
    status: true,
    number: true,
    sequence: true,
    date: true,
    ref_no: true,
    memo: true,
    subtotal: true,
    total: true,
    balance: true,
    currency: true,
    revision: true,
    entry: true,
    replaces: true,
    replaced_by: true,
    posted_by: true,
    posted_at: true,
    voided_by: true,
    voided_at: true,
    form: true,
    fields: true,
    sort_key: true,
    created: true,
    updated: true,
} satisfies Record<keyof BooksVendorCredits, true>

describe('books:vendor_credit forms host', () => {
    it('parses on books_vendor_credits, and its default form passes the host checks', () => {
        expect(VENDOR_CREDIT_HOST_KEY).toBe('books:vendor_credit')
        const host = creditHost()
        expect(host.collection).toBe('books_vendor_credits')
        expect(host.formColumn).toBe('form')
        expect(host.fieldsColumn).toBe('fields')
        expect(validateDefinitionForHost(defaultDefinitionFor(host), host)).toEqual([])
    })

    // A custom key must never shadow a column, the server-written ones included.
    it('lists every column of the collection, balance included', () => {
        const columns = creditHost().columns ?? []
        expect([...columns].sort()).toEqual(Object.keys(CREDIT_COLUMNS).sort())
        expect(columns).toContain('balance')
    })

    it('declares the built-ins in order, with no address, terms, due date or message', () => {
        const keys = creditHost().builtin.map(b => b.key)
        expect(keys).toEqual(['vendor', 'date', 'ref_no', 'account_lines', 'item_lines', 'memo'])
        for (const absent of ['mailing_address', 'terms', 'due_date', 'message']) {
            expect(keys, absent).not.toContain(absent)
        }
    })

    it('requires and locks Vendor and Credit date, each drawn by its Books component', () => {
        expect(builtinOf('vendor')).toMatchObject({
            kind: 'custom',
            component: 'VendorField',
            required: true,
            locked: true,
        })
        expect(builtinOf('date')).toMatchObject({
            kind: 'custom',
            component: 'DocumentDateField',
            label: 'Credit date',
            required: true,
            locked: true,
        })
    })

    it("draws Vendor's credit no. with VendorRefField, optional, at most 40 characters", () => {
        expect(builtinOf('ref_no')).toMatchObject({
            kind: 'custom',
            component: 'VendorRefField',
            label: "Vendor's credit no.",
            required: false,
        })
        const refNo = migrationField('2100000023_create_books_vendor_credits.js', 'ref_no')
        expect(fieldMax(refNo)).toBe(40)
    })

    it("gives Vendor's credit no. the vendor credit hint, and Memo the memo hint", () => {
        expect(VENDOR_CREDIT_REF_HINT).toBe("The number on the vendor's credit note")
        const fields = Object.fromEntries(
            defaultDefinitionFor(creditHost()).fields.map(f => [f.key, f])
        )
        expect(fields.ref_no?.description).toBe(VENDOR_CREDIT_REF_HINT)
        expect(fields.memo?.description).toBe(MEMO_HINT)
        expect(builtinOf('memo').kind).toBe('textarea')
    })

    // A required built-in cannot be hidden, and the form hides the table the Purchase
    // lines setting leaves out.
    it('does not require either line table, so either may be hidden', () => {
        expect(builtinOf('account_lines').required).toBe(false)
        expect(builtinOf('item_lines').required).toBe(false)
    })

    it("has the bill's two line tables: the same row kinds, columns and keys", () => {
        const bill = parsedHost(BILL_HOST_KEY)
        expect(builtinOf('account_lines')).toEqual(builtinOf('account_lines', bill))
        expect(builtinOf('item_lines')).toEqual(builtinOf('item_lines', bill))
    })

    it('sizes Amount the same in both tables, so the totals line up under it', () => {
        const size = floored(AMOUNT_COLUMN_WIDTH)
        expect(column('account_lines', 'amount')).toMatchObject(size)
        expect(column('item_lines', 'amount')).toMatchObject(size)
    })

    it('seeds one Vendor credit page with the three band cells a third each on one row, full width when narrow', () => {
        expect(VENDOR_CREDIT_LAYOUT.pages.map(p => p.title)).toEqual(['Vendor credit'])
        const definition = defaultDefinitionFor(creditHost())
        expect(definition.pages.map(p => p.title)).toEqual(['Vendor credit'])
        const fields = Object.fromEntries(definition.fields.map(f => [f.key, f]))
        for (const key of ['vendor', 'date', 'ref_no']) {
            expect(fields[key]?.width, key).toBe('third')
            expect(fields[key]?.narrowWidth, key).toBe('full')
        }
        const keys = definition.fields.map(f => f.key)
        expect(keys.slice(keys.indexOf('vendor'), keys.indexOf('vendor') + 3)).toEqual([
            'vendor',
            'date',
            'ref_no',
        ])
    })

    it('puts an admin’s custom fields before the line tables', () => {
        expect(creditHost().insertCustomBefore).toBe('account_lines')
    })

    it('names only components the forms UI module provides, line cells included', () => {
        const host = creditHost()
        const named = host.builtin.flatMap(b => [
            ...(b.component ? [b.component] : []),
            ...(b.columns ?? []).flatMap(c => (c.component ? [c.component] : [])),
        ])
        expect(named).toEqual(expect.arrayContaining(['VendorField', 'VendorRefField']))
        for (const name of named) expect(ui.components[name], name).toBeDefined()
    })
})
