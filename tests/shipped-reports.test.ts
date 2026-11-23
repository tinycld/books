import { describe, expect, it } from 'vitest'
import {
    RECONCILIATION_REPORT_SHIPPED_KEY,
    reportParamQuery,
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
})

describe('RECONCILIATION_REPORT_SHIPPED_KEY', () => {
    it("is the server's shipped key", () => {
        expect(RECONCILIATION_REPORT_SHIPPED_KEY).toBe('books.reconciliation_report')
    })
})
