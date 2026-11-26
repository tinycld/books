// The dashboard grid (the dashboard design spec §3 "The page"): the columns
// follow the page's own width, not the window's.

export const THREE_COLUMNS_FROM = 1100
export const TWO_COLUMNS_FROM = 700

export function columnsFor(pageWidth: number): 1 | 2 | 3 {
    if (pageWidth >= THREE_COLUMNS_FROM) return 3
    if (pageWidth >= TWO_COLUMNS_FROM) return 2
    return 1
}

// Rows of `columns` cells; a short last row is padded with null so its cards keep the
// column width.
export function gridRows<T>(items: readonly T[], columns: number): (T | null)[][] {
    const rows: (T | null)[][] = []
    for (let start = 0; start < items.length; start += columns) {
        const row: (T | null)[] = items.slice(start, start + columns)
        while (row.length < columns) row.push(null)
        rows.push(row)
    }
    return rows
}
