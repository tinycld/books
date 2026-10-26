import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { mergeValues, splitValues } from '@tinycld/core/lib/forms/values'
import { z } from '@tinycld/core/ui/form'
import { describe, expect, it } from 'vitest'
import hosts from '../tinycld/books/forms/hosts'
import { EMPTY_ADDRESS } from '../tinycld/books/lib/address'
import { customerColumnsFrom, EMPTY_CUSTOMER_COLUMNS } from '../tinycld/books/lib/customer-columns'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'

const BUILTIN_COLUMNS = [
    'display_name',
    'company',
    'first_name',
    'last_name',
    'email',
    'phone',
    'mobile',
    'website',
    'parent',
    'billing_address',
    'shipping_address',
    'notes',
]

function fixtureCustomer(id: string) {
    const record = CUSTOMERS.find(c => c.id === id)
    if (!record) throw new Error(`no fixture customer ${id}`)
    return record
}

// The columns core `splitValues` hands the save for a stored customer: the record read
// into form values by the default Customer form, then split back out.
function splitColumnsOf(id: string) {
    const host = hostDefSchema.parse(hosts[0])
    const definition = defaultDefinitionFor(host)
    const values = mergeValues(host, definition, { ...fixtureCustomer(id) })
    return splitValues(host, definition, values).columns
}

function refusalOf(columns: Record<string, unknown>) {
    const result = customerColumnsFrom(columns)
    if (result.success) throw new Error(`accepted ${JSON.stringify(columns)}`)
    return result.error
}

describe('customerColumnsFrom', () => {
    // Harborview has every text column and a null shipping address; the Seattle
    // warehouse has a parent and both addresses.
    for (const id of [CUSTOMER_IDS.harborview, CUSTOMER_IDS.northwindSeattle]) {
        it(`accepts the split columns of fixture customer ${id}`, () => {
            const columns = splitColumnsOf(id)
            expect(Object.keys(columns).sort()).toEqual([...BUILTIN_COLUMNS].sort())

            const result = customerColumnsFrom(columns)
            expect(result.success).toBe(true)
            if (!result.success) return
            expect(result.columns).toEqual(columns)
            expect(result.columns.display_name).toBe(fixtureCustomer(id).display_name)
            expect(result.columns.billing_address).toEqual(fixtureCustomer(id).billing_address)
            expect(result.columns.shipping_address).toEqual(fixtureCustomer(id).shipping_address)
        })
    }

    it('refuses a number in display_name', () => {
        const error = refusalOf({ display_name: 42 })
        expect(error).toBeInstanceOf(z.ZodError)
        expect(error.issues.map(issue => issue.path[0])).toContain('display_name')
    })

    it('refuses an address with a key outside the address parts', () => {
        const error = refusalOf({
            display_name: 'Acme',
            billing_address: { ...EMPTY_ADDRESS, county: 'King' },
        })
        expect(error).toBeInstanceOf(z.ZodError)
        expect(error.issues.map(issue => issue.path[0])).toContain('billing_address')
    })

    it('refuses a column the customer does not have', () => {
        const error = refusalOf({ display_name: 'Acme', nickname: 'Ace' })
        expect(error).toBeInstanceOf(z.ZodError)
        const unknownKeys = error.issues.flatMap(issue =>
            issue.code === 'unrecognized_keys' ? issue.keys : []
        )
        expect(unknownKeys).toEqual(['nickname'])
    })

    it('accepts null addresses', () => {
        const result = customerColumnsFrom({
            display_name: 'Acme',
            billing_address: null,
            shipping_address: null,
        })
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.columns).toEqual({
            display_name: 'Acme',
            billing_address: null,
            shipping_address: null,
        })
    })

    // Core `splitValues` leaves out a key whose value is undefined, and an edit patch
    // holds only the dirty keys, so every column is optional.
    it('accepts display_name alone and returns only display_name', () => {
        const result = customerColumnsFrom({ display_name: 'Acme' })
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(Object.keys(result.columns)).toEqual(['display_name'])
        expect(result.columns.display_name).toBe('Acme')
    })

    it('accepts phone alone and returns only phone', () => {
        const result = customerColumnsFrom({ phone: '1' })
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(Object.keys(result.columns)).toEqual(['phone'])
        expect(result.columns.phone).toBe('1')
    })
})

describe('EMPTY_CUSTOMER_COLUMNS', () => {
    it('stores every text column empty, no parent, no addresses and active', () => {
        expect(EMPTY_CUSTOMER_COLUMNS).toEqual({
            display_name: '',
            company: '',
            first_name: '',
            last_name: '',
            email: '',
            phone: '',
            mobile: '',
            website: '',
            parent: '',
            billing_address: null,
            shipping_address: null,
            notes: '',
            inactive: false,
        })
    })

    it('is the insert base, so a column the form left out is stored empty', () => {
        const result = customerColumnsFrom({ display_name: 'Acme' })
        expect(result.success).toBe(true)
        if (!result.success) return
        const insert = { ...EMPTY_CUSTOMER_COLUMNS, ...result.columns }
        expect(insert.display_name).toBe('Acme')
        expect(insert.shipping_address).toBeNull()
        expect(insert.billing_address).toBeNull()
        expect(insert.company).toBe('')
    })
})
