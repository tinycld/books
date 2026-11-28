import type { ParamDef } from '@tinycld/core/reports/lib/spec'
import { parseViewOptions } from '@tinycld/core/reports/lib/view-url'
import { describe, expect, it } from 'vitest'
import { stockInBinParams } from '~/tinycld/books/lib/bin-list'
import { BIN_IDS } from '~/tinycld/books/lib/inventory-adjust-fixture'
import {
    OPEN_PURCHASE_ORDERS_SHIPPED_KEY,
    RECONCILIATION_REPORT_SHIPPED_KEY,
    reportParamQuery,
    STOCK_BY_BIN_BINS_PARAM,
    STOCK_BY_BIN_SHIPPED_KEY,
} from '~/tinycld/books/lib/shipped-reports'

// Reconciliation report spec §4 "Reads" (the report link): the finished summary links the
// shipped report with each param written as core's view URL reads it.
describe('reportParamQuery', () => {
    it("writes each param under core's view-URL key", () => {
        expect(reportParamQuery({ statement: 'abc' })).toEqual({ 'p-statement': 'abc' })
    })

    it('gives no query for no params', () => {
        expect(reportParamQuery({})).toEqual({})
    })

    // Core writes a multi-pick as a JSON list (view-url.ts encodeParamValue) and reads it
    // only so; a bare id is refused and the report runs with its default.
    it('writes a list value as a JSON list, as core writes a multi-pick', () => {
        expect(reportParamQuery({ bins: [BIN_IDS.aisle3] })).toEqual({
            'p-bins': JSON.stringify([BIN_IDS.aisle3]),
        })
        expect(reportParamQuery({ bins: [BIN_IDS.aisle3] })['p-bins']).toBe(`["${BIN_IDS.aisle3}"]`)
    })

    it('keeps a string value as given beside a list value', () => {
        expect(reportParamQuery({ statement: 'abc', bins: [BIN_IDS.aisle3] })).toEqual({
            'p-statement': 'abc',
            'p-bins': `["${BIN_IDS.aisle3}"]`,
        })
    })
})

// Inventory-adjust spec §3.7: the row menu's Stock in this bin opens the Stock by Bin
// Location (§3.9) with this bin picked. The Bin param as server/report_bins.go
// stockByBinParams declares it: a multi-pick choice over books.bins.
const BINS_PARAM_DEF: ParamDef = {
    id: STOCK_BY_BIN_BINS_PARAM,
    type: 'choice',
    label: 'Bin',
    multiple: true,
    header: 'Bin: {label}',
    optionsFrom: { source: 'books.bins', value: [{ field: 'id' }], label: [{ field: 'name' }] },
}

describe('the Stock in this bin link', () => {
    it("is read by core's report view with the bin picked", () => {
        const search = reportParamQuery(stockInBinParams(BIN_IDS.aisle3))
        expect(parseViewOptions([BINS_PARAM_DEF], search).params[STOCK_BY_BIN_BINS_PARAM]).toEqual({
            kind: 'choice',
            values: [BIN_IDS.aisle3],
        })
    })
})

// Purchase-orders spec §3.10: the Purchase orders tab and the Vendors list link the
// shipped Open Purchase Orders by the key server/report_purchase_orders.go registers.
describe('OPEN_PURCHASE_ORDERS_SHIPPED_KEY', () => {
    it("is the server's shipped key", () => {
        expect(OPEN_PURCHASE_ORDERS_SHIPPED_KEY).toBe('books.open_purchase_orders')
    })
})

// Inventory-adjust spec §3.9: the Bin locations tab and its row menu link the shipped
// Stock by Bin Location by the key server/report_bins.go registers.
describe('STOCK_BY_BIN_SHIPPED_KEY', () => {
    it("is the server's shipped key", () => {
        expect(STOCK_BY_BIN_SHIPPED_KEY).toBe('books.stock_by_bin')
    })
})

describe('RECONCILIATION_REPORT_SHIPPED_KEY', () => {
    it("is the server's shipped key", () => {
        expect(RECONCILIATION_REPORT_SHIPPED_KEY).toBe('books.reconciliation_report')
    })
})
