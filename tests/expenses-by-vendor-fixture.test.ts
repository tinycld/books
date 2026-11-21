import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import { describe, expect, it } from 'vitest'
import {
    EXPENSES_BY_VENDOR_DESCRIPTION,
    EXPENSES_BY_VENDOR_DISPLAY,
    EXPENSES_BY_VENDOR_EMPTY_FROM,
    EXPENSES_BY_VENDOR_EMPTY_TO,
    EXPENSES_BY_VENDOR_PARAMS,
    EXPENSES_BY_VENDOR_SEED,
    EXPENSES_BY_VENDOR_TITLE,
} from '../tinycld/books/lib/expenses-by-vendor-fixture'
import { VENDOR_IDS } from '../tinycld/books/lib/vendor-form-fixture'

type ExpensesByVendorSpecFile = {
    title: string
    description: string
    emptyFrom: string
    emptyTo: string
    params: ParamDef[]
    display: NonNullable<ReportSpec['display']>
}

// The Go shipped report and this fixture hold the same title, description, params and
// display. Both are compared with server/testdata/expenses_by_vendor_spec.json
// (TestExpensesByVendorMatchesSharedSpecFile reads it too), so a value changed on one
// side only fails one of the two tests.
const specFile: ExpensesByVendorSpecFile = JSON.parse(
    readFileSync(
        join(__dirname, '..', 'server', 'testdata', 'expenses_by_vendor_spec.json'),
        'utf8'
    )
)

describe('Expenses by Vendor fixture against the shared spec file', () => {
    it('has the title and the description the report ships with', () => {
        expect(EXPENSES_BY_VENDOR_TITLE).toBe(specFile.title)
        expect(EXPENSES_BY_VENDOR_DESCRIPTION).toBe(specFile.description)
    })

    it('has the params the report ships with', () => {
        expect(EXPENSES_BY_VENDOR_PARAMS).toEqual(specFile.params)
    })

    it('draws the rows with the display the report ships with (plan D1)', () => {
        expect(EXPENSES_BY_VENDOR_DISPLAY).toEqual(specFile.display)
    })

    it('has the empty period TestExpensesByVendorEmpty runs on', () => {
        expect(EXPENSES_BY_VENDOR_EMPTY_FROM).toBe(specFile.emptyFrom)
        expect(EXPENSES_BY_VENDOR_EMPTY_TO).toBe(specFile.emptyTo)
    })
})

// Plan D5: one posted journal entry on 6200 Software Subscriptions that nets to zero, so
// no statement figure moves: a debit naming the inactive Coastal Coffee Roasters, a debit
// naming the long-named Willamette vendor, and a credit naming no vendor.
describe('EXPENSES_BY_VENDOR_SEED', () => {
    it('is the D5 entry: three lines on 6200 that name the two vendors and net to zero', () => {
        expect(EXPENSES_BY_VENDOR_SEED).toEqual({
            date: '2026-09-16',
            memo: 'Seed expenses by vendor: software by vendor',
            lines: [
                { account: '6200', debit: 9600, credit: 0, vendor: VENDOR_IDS.coastalCoffee },
                { account: '6200', debit: 18400, credit: 0, vendor: VENDOR_IDS.willamette },
                { account: '6200', debit: 0, credit: 28000, vendor: '' },
            ],
        })
        const net = EXPENSES_BY_VENDOR_SEED.lines.reduce(
            (sum, line) => sum + line.debit - line.credit,
            0
        )
        expect(net).toBe(0)
    })
})
