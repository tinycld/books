export type CellWidth = { width: number; minWidth?: number } | { minWidth: number }

/**
 * A table's own minimum width: each cell at its `minWidth` (a fixed cell at its `width`),
 * the `gap` between each two cells, and the row's `padding` (both sides together).
 */
export function tableMinWidth(input: {
    cells: readonly CellWidth[]
    gap: number
    padding: number
}): number {
    const { cells, gap, padding } = input
    const cellsWidth = cells.reduce(
        (sum, cell) => sum + (cell.minWidth ?? ('width' in cell ? cell.width : 0)),
        0
    )
    return cellsWidth + gap * Math.max(0, cells.length - 1) + padding
}

/**
 * Whether a list draws cards in place of its table: on a phone, and when the list's own
 * width cannot hold what `ListTable` draws, the table's minimum plus the scrollbar gutter
 * it adds to its sideways scroller's content, so a table never scrolls sideways. Before
 * the first layout (`width` null) it follows the breakpoint alone.
 */
export function showsTableCards({
    isPhone,
    width,
    minWidth,
    gutter,
}: {
    isPhone: boolean
    width: number | null
    minWidth: number
    gutter: number
}): boolean {
    return isPhone || (width !== null && width < minWidth + gutter)
}
