import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReportSpec } from '@tinycld/core/reports/lib/spec'
import { describe, expect, it } from 'vitest'
import {
    AUDIT_EVENT_OPTIONS,
    AUDIT_LOG_DESCRIPTION,
    AUDIT_LOG_DISPLAY,
    AUDIT_LOG_TITLE,
    AUDIT_RECORD_TYPE_OPTIONS,
} from '../tinycld/books/lib/audit-log-fixture'

type GoldenOption = { value: string; label: string }

// The parts of server/testdata/audit_log_spec.json this test reads (TestAuditLogSpecLoads
// writes the whole of it from the Go copy).
type AuditGolden = {
    title: string
    description: string
    eventOptions: GoldenOption[]
    recordTypeOptions: GoldenOption[]
    display: NonNullable<ReportSpec['display']>
    spec: {
        params: { id: string; options?: GoldenOption[] }[]
        display: NonNullable<ReportSpec['display']>
    }
}

// The Go shipped report and this fixture are two copies of one design; both are
// compared with the same golden file (TestAuditLogSpecLoads reads it too), so a
// drift in either copy fails a test.
const golden: AuditGolden = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'audit_log_spec.json'), 'utf8')
)

function paramOptions(id: string) {
    return golden.spec.params.find(param => param.id === id)?.options
}

describe('audit log fixture against the Go golden spec', () => {
    it('has the title and the description the report ships with', () => {
        expect(AUDIT_LOG_TITLE).toBe(golden.title)
        expect(AUDIT_LOG_DESCRIPTION).toBe(golden.description)
    })

    it('lists the events of the Event chip in the shipped order', () => {
        expect(AUDIT_EVENT_OPTIONS).toEqual(golden.eventOptions)
        expect(AUDIT_EVENT_OPTIONS).toEqual(paramOptions('events'))
    })

    it('lists the record types of the Record type chip in the shipped order', () => {
        expect(AUDIT_RECORD_TYPE_OPTIONS).toEqual(golden.recordTypeOptions)
        expect(AUDIT_RECORD_TYPE_OPTIONS).toEqual(paramOptions('types'))
    })

    // Vendor refund spec §3.11: the Record type chip grows by the refund and its line.
    it('offers the vendor refund and the vendor refund line as record types', () => {
        expect(AUDIT_RECORD_TYPE_OPTIONS).toContainEqual({
            value: 'books_vendor_refunds',
            label: 'Vendor refund',
        })
        expect(AUDIT_RECORD_TYPE_OPTIONS).toContainEqual({
            value: 'books_vendor_refund_lines',
            label: 'Vendor refund line',
        })
        expect(golden.recordTypeOptions).toEqual(AUDIT_RECORD_TYPE_OPTIONS)
    })

    // Bank deposit spec §3.7: the Record type chip grows by the deposit, its item and its line.
    it('offers the deposit, the deposit item and the deposit line as record types', () => {
        for (const option of [
            { value: 'books_deposits', label: 'Deposit' },
            { value: 'books_deposit_items', label: 'Deposit item' },
            { value: 'books_deposit_lines', label: 'Deposit line' },
        ]) {
            expect(AUDIT_RECORD_TYPE_OPTIONS).toContainEqual(option)
            expect(golden.recordTypeOptions).toContainEqual(option)
        }
    })

    it('draws the rows with the display the report ships with', () => {
        expect(AUDIT_LOG_DISPLAY).toEqual(golden.display)
        expect(AUDIT_LOG_DISPLAY).toEqual(golden.spec.display)
    })

    // A long word in Record would hold the column at its width and move every phone
    // row to core's three-line layout; Record breaks such a word inside its line.
    it('lets the wrapping Record column break a long word', () => {
        expect(AUDIT_LOG_DISPLAY.columns?.record).toMatchObject({
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
        })
    })
})
