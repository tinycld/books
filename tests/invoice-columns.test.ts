// @vitest-environment happy-dom
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { mergeValues, splitValues } from '@tinycld/core/lib/forms/values'
import { z } from '@tinycld/core/ui/form'
import { describe, expect, it } from 'vitest'
import hosts, { INVOICE_HOST_KEY } from '../tinycld/books/forms/hosts'
import { EMPTY_ADDRESS } from '../tinycld/books/lib/address'
import { EMPTY_INVOICE_COLUMNS, invoiceColumnsFrom } from '../tinycld/books/lib/invoice-columns'
import { INVOICE_IDS, INVOICES } from '../tinycld/books/lib/invoice-form-fixture'

const BUILTIN_COLUMNS = [
    'customer',
    'bill_to',
    'email',
    'terms',
    'date',
    'due_date',
    'tax_rate',
    'message',
    'memo',
]

function fixtureInvoice(id: string) {
    const record = INVOICES.find(row => row.id === id)
    if (!record) throw new Error(`no fixture invoice ${id}`)
    return record
}

// The columns core `splitValues` hands the save for a stored invoice: the record read
// into form values by the default Invoice form, then split back out.
function splitColumnsOf(id: string) {
    const found = hosts.find(h => h.key === INVOICE_HOST_KEY)
    if (!found) throw new Error('no books:invoice host in forms/hosts.ts')
    const host = hostDefSchema.parse(found)
    const definition = defaultDefinitionFor(host)
    const values = mergeValues(host, definition, { ...fixtureInvoice(id) })
    return splitValues(host, definition, values).columns
}

function refusalOf(columns: Record<string, unknown>) {
    const result = invoiceColumnsFrom(columns)
    if (result.success) throw new Error(`accepted ${JSON.stringify(columns)}`)
    return result.error
}

describe('invoiceColumnsFrom', () => {
    it('accepts the split columns of the fixture draft as they are', () => {
        const columns = splitColumnsOf(INVOICE_IDS.draft)
        expect(Object.keys(columns).sort()).toEqual([...BUILTIN_COLUMNS].sort())
        const result = invoiceColumnsFrom(columns)
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.columns).toEqual(columns)
        expect(result.columns.customer).toBe(fixtureInvoice(INVOICE_IDS.draft).customer)
    })

    it('refuses a column the invoice does not have', () => {
        const error = refusalOf({ customer: 'cust_harbor_001', status: 'posted' })
        expect(error).toBeInstanceOf(z.ZodError)
        const unknownKeys = error.issues.flatMap(issue =>
            issue.code === 'unrecognized_keys' ? issue.keys : []
        )
        expect(unknownKeys).toEqual(['status'])
    })

    it('refuses terms outside the payment terms', () => {
        const error = refusalOf({ terms: 'net_45' })
        expect(error.issues.map(issue => issue.path[0])).toEqual(['terms'])
    })

    it('accepts empty terms and every payment term', () => {
        for (const terms of ['', 'due_on_receipt', 'net_10', 'net_15', 'net_30', 'net_60']) {
            const result = invoiceColumnsFrom({ terms })
            expect(result.success, terms).toBe(true)
        }
    })

    it('refuses a bill-to address with a key outside the address parts', () => {
        const error = refusalOf({ bill_to: { ...EMPTY_ADDRESS, county: 'King' } })
        expect(error.issues.map(issue => issue.path[0])).toContain('bill_to')
    })

    it('accepts memo alone and returns only memo', () => {
        const result = invoiceColumnsFrom({ memo: 'October visit' })
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.columns).toEqual({ memo: 'October visit' })
    })
})

describe('EMPTY_INVOICE_COLUMNS', () => {
    it('stores every column empty, no address, as a draft that replaces nothing and names no estimate', () => {
        expect(EMPTY_INVOICE_COLUMNS).toEqual({
            customer: '',
            bill_to: null,
            email: '',
            terms: '',
            date: '',
            due_date: '',
            tax_rate: '',
            message: '',
            memo: '',
            estimate: '',
            status: 'draft',
            replaces: '',
        })
    })

    it('is the insert base, so a column the form left out is stored empty', () => {
        const result = invoiceColumnsFrom({ customer: 'cust_harbor_001', memo: 'Visit' })
        expect(result.success).toBe(true)
        if (!result.success) return
        const insert = { ...EMPTY_INVOICE_COLUMNS, ...result.columns }
        expect(insert.customer).toBe('cust_harbor_001')
        expect(insert.bill_to).toBeNull()
        expect(insert.tax_rate).toBe('')
        expect(insert.status).toBe('draft')
    })
})
