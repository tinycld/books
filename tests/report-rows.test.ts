import { describe, expect, it } from 'vitest'
import type { ReportModelRow } from '../tinycld/books/lib/report-definition'
import {
    foldAllLabel,
    foldAllTarget,
    sectionIds,
    type VisibleReportRow,
    visibleReportRows,
} from '../tinycld/books/lib/report-rows'
import {
    PROFIT_AND_LOSS_MODEL,
    TRIAL_BALANCE_MODEL,
} from '../tinycld/books/lib/report-shell-fixture'

const ROWS = PROFIT_AND_LOSS_MODEL.rows
const ALL_SECTIONS = ['income', 'cogs', 'expenses', 'professional-fees']

function rowById(id: string): ReportModelRow {
    const row = ROWS.find(r => r.id === id)
    if (!row) throw new Error(`fixture has no row ${id}`)
    return row
}

// The rows that stay, each unfolded with its own cells, except the folded sections, which
// show their subtotal's cells.
function expectedRows(hidden: string[], folded: string[]): VisibleReportRow[] {
    return ROWS.filter(row => !hidden.includes(row.id)).map(row =>
        folded.includes(row.id)
            ? { row, cells: rowById(`${row.id}:subtotal`).cells, isFolded: true }
            : { row, cells: row.cells, isFolded: false }
    )
}

describe('visibleReportRows', () => {
    it('shows every row in order with its own cells when nothing is folded', () => {
        const visible = visibleReportRows(ROWS, [])
        expect(visible).toEqual(expectedRows([], []))
        expect(visible.map(v => v.row.id)).toEqual(ROWS.map(r => r.id))
        for (const id of ALL_SECTIONS) {
            const section = visible.find(v => v.row.id === id)
            expect(section?.cells).toEqual({})
            expect(section?.isFolded).toBe(false)
        }
    })

    it('folding cogs hides its detail and subtotal and shows the subtotal on the section row', () => {
        const visible = visibleReportRows(ROWS, ['cogs'])
        const ids = visible.map(v => v.row.id)
        expect(ids).not.toContain('cogs:5000')
        expect(ids).not.toContain('cogs:subtotal')
        const cogs = visible.find(v => v.row.id === 'cogs')
        expect(cogs?.isFolded).toBe(true)
        expect(cogs?.cells).toEqual(rowById('cogs:subtotal').cells)
        expect(rowById('cogs:subtotal').label).toBe('Total cost of goods sold')
        expect(cogs?.cells.total).toBe(412_000)
        expect(visible).toEqual(expectedRows(['cogs:5000', 'cogs:subtotal'], ['cogs']))
    })

    it('folding expenses hides its details, the nested section and the expenses subtotal', () => {
        const hidden = [
            'expenses:6000',
            'expenses:6100',
            'expenses:6200',
            'expenses:6300',
            'expenses:6400',
            'professional-fees',
            'professional-fees:6510',
            'professional-fees:6520',
            'professional-fees:subtotal',
            'expenses:subtotal',
        ]
        const visible = visibleReportRows(ROWS, ['expenses'])
        expect(visible).toEqual(expectedRows(hidden, ['expenses']))
        const ids = visible.map(v => v.row.id)
        expect(ids).toContain('expenses')
        expect(ids).toContain('net-income')
        for (const id of hidden) expect(ids).not.toContain(id)
    })

    it('folding only professional-fees keeps the expenses subtotal', () => {
        const hidden = [
            'professional-fees:6510',
            'professional-fees:6520',
            'professional-fees:subtotal',
        ]
        const visible = visibleReportRows(ROWS, ['professional-fees'])
        expect(visible).toEqual(expectedRows(hidden, ['professional-fees']))
        const ids = visible.map(v => v.row.id)
        expect(ids).toContain('expenses:subtotal')
        expect(ids).toContain('expenses:6400')
        const fees = visible.find(v => v.row.id === 'professional-fees')
        expect(fees?.isFolded).toBe(true)
        expect(fees?.cells).toEqual(rowById('professional-fees:subtotal').cells)
    })
})

describe('sectionIds', () => {
    it('lists every section row id in order', () => {
        expect(sectionIds(ROWS)).toEqual(ALL_SECTIONS)
    })
})

describe('foldAllLabel', () => {
    it('says Collapse all while any section is unfolded', () => {
        expect(foldAllLabel(ROWS, [])).toBe('Collapse all')
        expect(foldAllLabel(ROWS, ['cogs', 'professional-fees'])).toBe('Collapse all')
    })

    it('says Expand all when every section is folded', () => {
        expect(foldAllLabel(ROWS, ALL_SECTIONS)).toBe('Expand all')
    })

    it('is null for a report with no sections', () => {
        expect(foldAllLabel(TRIAL_BALANCE_MODEL.rows, [])).toBeNull()
    })
})

describe('foldAllTarget', () => {
    it('folds every section when any is unfolded', () => {
        expect([...foldAllTarget(ROWS, [])].sort()).toEqual([...ALL_SECTIONS].sort())
        expect([...foldAllTarget(ROWS, ['cogs'])].sort()).toEqual([...ALL_SECTIONS].sort())
    })

    it('unfolds everything when all are folded', () => {
        expect(foldAllTarget(ROWS, ALL_SECTIONS)).toEqual([])
    })
})
