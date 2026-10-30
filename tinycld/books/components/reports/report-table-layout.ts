import type { Breakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import type { ReportColumn } from '../../lib/report-definition'

export const ROW_HEIGHT = 44
export const AMOUNT_WIDTH = 128
export const LABEL_MIN_WIDTH = 220
export const PHONE_LABEL_WIDTH = 168
export const PHONE_AMOUNT_WIDTH = 108
export const INDENT = 16

// A phone fits this many amount columns whole beside the label; more scroll sideways.
const PHONE_FIT_COLUMNS = 2

export type ReportTableLayout = {
    labelStyle: { flex?: number; minWidth?: number; width?: number }
    amountWidth: number
    scrollsSideways: boolean
    amountContentMinWidth: number
}

function layoutFor(
    labelStyle: ReportTableLayout['labelStyle'],
    amountWidth: number,
    scrollsSideways: boolean,
    amountCount: number
): ReportTableLayout {
    return {
        labelStyle,
        amountWidth,
        scrollsSideways,
        amountContentMinWidth: amountCount * amountWidth,
    }
}

// One rule for a column's heading and its cells, so a heading sits over its figures.
// The first column holds the row labels, so it is left whatever its kind.
export function columnAlign(column: ReportColumn, index: number): 'left' | 'right' {
    if (index === 0) return 'left'
    return column.kind === 'money' || column.kind === 'percent' ? 'right' : 'left'
}

// Wide: the label takes the free space and the fixed amount columns scroll sideways only
// when they do not fit. Phone: one or two narrower amount columns sit whole beside the
// label; three or more keep the wide width and scroll beside a fixed label.
export function reportTableLayout(input: {
    breakpoint: Breakpoint
    amountCount: number
}): ReportTableLayout {
    const { breakpoint, amountCount } = input
    if (breakpoint !== 'mobile') {
        return layoutFor({ flex: 1, minWidth: LABEL_MIN_WIDTH }, AMOUNT_WIDTH, true, amountCount)
    }
    if (amountCount <= PHONE_FIT_COLUMNS) {
        return layoutFor({ flex: 1 }, PHONE_AMOUNT_WIDTH, false, amountCount)
    }
    return layoutFor({ width: PHONE_LABEL_WIDTH }, AMOUNT_WIDTH, true, amountCount)
}
