import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import { describe, expect, it } from 'vitest'
import {
    VENDOR_BALANCE_DESCRIPTION,
    VENDOR_BALANCE_DISPLAY,
    VENDOR_BALANCE_EMPTY_DAY,
    VENDOR_BALANCE_PARAMS,
    VENDOR_BALANCE_TITLE,
} from '../tinycld/books/lib/vendor-balance-fixture'

type VendorBalanceSpecFile = {
    title: string
    description: string
    emptyDay: string
    params: ParamDef[]
    display: NonNullable<ReportSpec['display']>
}

// Plan D6: the Go shipped report and this fixture hold the same title, description,
// params and display. Both are compared with server/testdata/vendor_balance_spec.json
// (TestVendorBalanceMatchesSharedSpecFile reads it too), so a value changed on one side
// only fails one of the two tests.
const specFile: VendorBalanceSpecFile = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'vendor_balance_spec.json'), 'utf8')
)

describe('Vendor Balance fixture against the shared spec file', () => {
    it('has the title and the description the report ships with', () => {
        expect(VENDOR_BALANCE_TITLE).toBe(specFile.title)
        expect(VENDOR_BALANCE_DESCRIPTION).toBe(specFile.description)
    })

    it('has the params the report ships with', () => {
        expect(VENDOR_BALANCE_PARAMS).toEqual(specFile.params)
    })

    it('draws the rows with the display the report ships with', () => {
        expect(VENDOR_BALANCE_DISPLAY).toEqual(specFile.display)
    })

    it('has the empty day TestVendorBalanceEmpty runs on', () => {
        expect(VENDOR_BALANCE_EMPTY_DAY).toBe(specFile.emptyDay)
    })
})
