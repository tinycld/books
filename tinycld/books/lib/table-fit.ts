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
