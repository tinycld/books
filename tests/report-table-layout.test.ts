import { describe, expect, it } from 'vitest'
import {
    AMOUNT_WIDTH,
    columnAlign,
    INDENT,
    LABEL_MIN_WIDTH,
    PHONE_AMOUNT_WIDTH,
    PHONE_LABEL_WIDTH,
    ROW_HEIGHT,
    reportTableLayout,
} from '../tinycld/books/components/reports/report-table-layout'
import type { ReportColumn } from '../tinycld/books/lib/report-definition'

describe('report table layout constants', () => {
    it('match the spec sizes', () => {
        expect({
            ROW_HEIGHT,
            AMOUNT_WIDTH,
            LABEL_MIN_WIDTH,
            PHONE_LABEL_WIDTH,
            PHONE_AMOUNT_WIDTH,
            INDENT,
        }).toEqual({
            ROW_HEIGHT: 44,
            AMOUNT_WIDTH: 128,
            LABEL_MIN_WIDTH: 220,
            PHONE_LABEL_WIDTH: 168,
            PHONE_AMOUNT_WIDTH: 108,
            INDENT: 16,
        })
    })
})

describe('reportTableLayout', () => {
    it('gives the label column the free space (at least 220) and fixed 128 amounts on desktop', () => {
        expect(reportTableLayout({ breakpoint: 'desktop', amountCount: 2 })).toEqual({
            labelStyle: { flex: 1, minWidth: 220 },
            amountWidth: 128,
            scrollsSideways: true,
            amountContentMinWidth: 256,
        })
    })

    it('lays out a tablet like a desktop', () => {
        expect(reportTableLayout({ breakpoint: 'tablet', amountCount: 2 })).toEqual({
            labelStyle: { flex: 1, minWidth: 220 },
            amountWidth: 128,
            scrollsSideways: true,
            amountContentMinWidth: 256,
        })
    })

    it('fits one or two 108 amount columns beside a flexible label on a phone, with no sideways scroll', () => {
        for (const amountCount of [1, 2]) {
            const layout = reportTableLayout({ breakpoint: 'mobile', amountCount })
            expect(layout.labelStyle).toEqual({ flex: 1 })
            expect(layout.amountWidth).toBe(108)
            expect(layout.scrollsSideways).toBe(false)
        }
    })

    it('fixes the phone label at 168 and scrolls three or more 128 amount columns sideways', () => {
        expect(reportTableLayout({ breakpoint: 'mobile', amountCount: 3 })).toEqual({
            labelStyle: { width: 168 },
            amountWidth: 128,
            scrollsSideways: true,
            amountContentMinWidth: 384,
        })
        expect(reportTableLayout({ breakpoint: 'mobile', amountCount: 5 })).toEqual({
            labelStyle: { width: 168 },
            amountWidth: 128,
            scrollsSideways: true,
            amountContentMinWidth: 640,
        })
    })
})

describe('columnAlign', () => {
    const column = (kind: ReportColumn['kind']): ReportColumn => ({ id: kind, label: kind, kind })

    it('right aligns money and percent columns after the first', () => {
        expect(columnAlign(column('money'), 1)).toBe('right')
        expect(columnAlign(column('percent'), 2)).toBe('right')
    })

    it('left aligns text and date columns after the first', () => {
        expect(columnAlign(column('text'), 1)).toBe('left')
        expect(columnAlign(column('date'), 3)).toBe('left')
    })

    it('left aligns the first column whatever its kind', () => {
        expect(columnAlign(column('text'), 0)).toBe('left')
        expect(columnAlign(column('date'), 0)).toBe('left')
        expect(columnAlign(column('money'), 0)).toBe('left')
        expect(columnAlign(column('percent'), 0)).toBe('left')
    })
})
