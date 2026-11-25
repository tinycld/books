import { describe, expect, it } from 'vitest'
import { REPORT_GROUPS, reportGroup } from '../tinycld/books/lib/report-groups'

describe('reportGroup', () => {
    it('puts a saved report (no shipped key) in Saved, the last group', () => {
        expect(reportGroup('')).toBe('saved')
        expect(REPORT_GROUPS[REPORT_GROUPS.length - 1]).toBe('saved')
    })

    it('puts a shipped report that is not in the map in Accounting', () => {
        expect(reportGroup('books.some_new_report')).toBe('accounting')
    })

    it('puts the statements with Sales and the 1099s with Expenses', () => {
        expect(reportGroup('books.statement_open_items')).toBe('sales')
        expect(reportGroup('books.form_1099')).toBe('expenses')
    })
})
