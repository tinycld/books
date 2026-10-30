import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { mergeValues, splitValues } from '@tinycld/core/lib/forms/values'
import { z } from '@tinycld/core/ui/form'
import { describe, expect, it } from 'vitest'
import hosts from '../tinycld/books/forms/hosts'
import { EMPTY_ADDRESS } from '../tinycld/books/lib/address'
import {
    EMPTY_VENDOR_COLUMNS,
    EMPTY_VENDOR_FIELDS,
    vendorColumnsFrom,
} from '../tinycld/books/lib/vendor-columns'
import { VENDOR_IDS, VENDORS } from '../tinycld/books/lib/vendor-form-fixture'
import type { BooksVendors } from '../tinycld/books/types'

const BUILTIN_COLUMNS = [
    'display_name',
    'company',
    'first_name',
    'last_name',
    'email',
    'phone',
    'mobile',
    'website',
    'address',
    'terms',
    'account_number',
    'expense_account',
    'notes',
]

function vendorHost() {
    const host = hosts.find(h => h.key === 'books:vendor')
    if (!host) throw new Error('no books:vendor host in forms/hosts.ts')
    return hostDefSchema.parse(host)
}

// Office Supply World fills every column. The fixture names its expense account by
// seed number; a stored row holds the account's id.
function officeSupplyRow() {
    const fixture = VENDORS.find(v => v.id === VENDOR_IDS.officeSupply)
    if (!fixture) throw new Error('no fixture vendor Office Supply World')
    const { expense_account_number: _number, ...row } = fixture
    return { ...row, expense_account: 'acc6210seedid00' }
}

// The columns core `splitValues` hands the save for a stored vendor: the record read
// into form values by the default Vendor form, then split back out.
function splitColumnsOf(record: Record<string, unknown>) {
    const host = vendorHost()
    const definition = defaultDefinitionFor(host)
    const values = mergeValues(host, definition, record)
    return splitValues(host, definition, values).columns
}

function refusalOf(columns: Record<string, unknown>) {
    const result = vendorColumnsFrom(columns)
    if (result.success) throw new Error(`accepted ${JSON.stringify(columns)}`)
    return result.error
}

describe('vendorColumnsFrom', () => {
    it('accepts the split columns of fixture vendor Office Supply World, typed', () => {
        const row = officeSupplyRow()
        const columns = splitColumnsOf({ ...row })
        expect(Object.keys(columns).sort()).toEqual([...BUILTIN_COLUMNS].sort())

        const result = vendorColumnsFrom(columns)
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.columns).toEqual(columns)
        expect(result.columns.display_name).toBe('Office Supply World')
        expect(result.columns.address).toEqual(row.address)
        expect(result.columns.terms).toBe('net_15')
        expect(result.columns.account_number).toBe('1234567')
        expect(result.columns.expense_account).toBe('acc6210seedid00')
        // The parsed terms are the generated row's terms: tsc refuses this when they drift.
        const sample = { terms: result.columns.terms ?? '' } satisfies Pick<BooksVendors, 'terms'>
        expect(sample.terms).toBe('net_15')
    })

    it('refuses a number in display_name', () => {
        const error = refusalOf({ display_name: 42 })
        expect(error).toBeInstanceOf(z.ZodError)
        expect(error.issues.map(issue => issue.path[0])).toContain('display_name')
    })

    it('refuses an address with a key outside the address parts', () => {
        const error = refusalOf({
            display_name: 'Acme',
            address: { ...EMPTY_ADDRESS, county: 'King' },
        })
        expect(error).toBeInstanceOf(z.ZodError)
        expect(error.issues.map(issue => issue.path[0])).toContain('address')
    })

    it('refuses a payment term outside the list', () => {
        const error = refusalOf({ display_name: 'Acme', terms: 'net_90' })
        expect(error).toBeInstanceOf(z.ZodError)
        expect(error.issues.map(issue => issue.path[0])).toContain('terms')
    })

    it('refuses a column the vendor does not have', () => {
        const error = refusalOf({ display_name: 'Acme', parent: 'x' })
        expect(error).toBeInstanceOf(z.ZodError)
        const unknownKeys = error.issues.flatMap(issue =>
            issue.code === 'unrecognized_keys' ? issue.keys : []
        )
        expect(unknownKeys).toEqual(['parent'])
    })

    it('accepts a null address and no payment term', () => {
        const result = vendorColumnsFrom({ display_name: 'Acme', address: null, terms: '' })
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.columns).toEqual({ display_name: 'Acme', address: null, terms: '' })
    })

    // Core `splitValues` leaves out a key whose value is undefined, and an edit patch
    // holds only the dirty keys, so every column is optional.
    it('accepts display_name alone and returns only display_name', () => {
        const result = vendorColumnsFrom({ display_name: 'Acme' })
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(Object.keys(result.columns)).toEqual(['display_name'])
        expect(result.columns.display_name).toBe('Acme')
    })
})

describe('EMPTY_VENDOR_COLUMNS', () => {
    it('is the insert base, so a column the form left out is stored empty and active', () => {
        const result = vendorColumnsFrom({ display_name: 'Acme' })
        expect(result.success).toBe(true)
        if (!result.success) return
        const insert = { ...EMPTY_VENDOR_COLUMNS, ...result.columns }
        expect(insert.display_name).toBe('Acme')
        expect(insert.address).toBeNull()
        expect(insert.terms).toBe('')
        expect(insert.expense_account).toBe('')
        expect(insert.inactive).toBe(false)
    })
})

describe('EMPTY_VENDOR_FIELDS', () => {
    it('has exactly the built-in keys of the books:vendor host', () => {
        const builtinKeys = vendorHost().builtin.map(b => b.key)
        expect(Object.keys(EMPTY_VENDOR_FIELDS).sort()).toEqual([...builtinKeys].sort())
        expect(builtinKeys.sort()).toEqual([...BUILTIN_COLUMNS].sort())
    })
})
