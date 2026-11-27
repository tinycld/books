import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import { describe, expect, it } from 'vitest'
import {
    OPEN_PURCHASE_ORDERS_DESCRIPTION,
    OPEN_PURCHASE_ORDERS_DISPLAY,
    OPEN_PURCHASE_ORDERS_EMPTY_TEXT,
    OPEN_PURCHASE_ORDERS_PARAMS,
    OPEN_PURCHASE_ORDERS_TITLE,
} from '../tinycld/books/lib/open-purchase-orders-fixture'

type OpenPurchaseOrdersSpecFile = {
    title: string
    description: string
    emptyText: string
    params: ParamDef[]
    display: NonNullable<ReportSpec['display']>
}

// The Go shipped report and this fixture hold the same title, description, empty text,
// params and display. Both are compared with server/testdata/open_purchase_orders_spec.json
// (TestOpenPurchaseOrdersMatchesSharedSpecFile reads it too), so a value changed on one
// side only fails one of the two tests.
const specFile: OpenPurchaseOrdersSpecFile = JSON.parse(
    readFileSync(
        join(__dirname, '..', 'server', 'testdata', 'open_purchase_orders_spec.json'),
        'utf8'
    )
)

describe('Open Purchase Orders fixture against the shared spec file', () => {
    it('has the title and the description the report ships with', () => {
        expect(OPEN_PURCHASE_ORDERS_TITLE).toBe(specFile.title)
        expect(OPEN_PURCHASE_ORDERS_DESCRIPTION).toBe(specFile.description)
    })

    it('has the empty text the report ships with', () => {
        expect(OPEN_PURCHASE_ORDERS_EMPTY_TEXT).toBe(specFile.emptyText)
    })

    it('has the params the report ships with', () => {
        expect(OPEN_PURCHASE_ORDERS_PARAMS).toEqual(specFile.params)
    })

    it('draws the rows with the display the report ships with', () => {
        expect(OPEN_PURCHASE_ORDERS_DISPLAY).toEqual(specFile.display)
    })
})
