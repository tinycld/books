import type { ReportCellValue, ReportModelRow } from './report-definition'

export type VisibleReportRow = {
    row: ReportModelRow
    cells: Record<string, ReportCellValue>
    isFolded: boolean
}

// A row is hidden when any section on its chain (its own section, then that section's
// parent, and so on) is folded. A section row's own `section` is its parent, so folding a
// section hides what it holds but keeps its own row.
function isHidden(
    row: ReportModelRow,
    parentOf: ReadonlyMap<string, string | undefined>,
    folded: ReadonlySet<string>
): boolean {
    const seen = new Set<string>()
    let section = row.section
    while (section !== undefined && !seen.has(section)) {
        if (folded.has(section)) return true
        seen.add(section)
        section = parentOf.get(section)
    }
    return false
}

export function visibleReportRows(
    rows: readonly ReportModelRow[],
    folded: readonly string[]
): VisibleReportRow[] {
    const foldedSet = new Set(folded)
    const parentOf = new Map<string, string | undefined>()
    const subtotalCells = new Map<string, Record<string, ReportCellValue>>()
    for (const row of rows) {
        if (row.kind === 'section') parentOf.set(row.id, row.section)
        if (row.kind === 'subtotal' && row.section !== undefined) {
            subtotalCells.set(row.section, row.cells)
        }
    }
    return rows
        .filter(row => !isHidden(row, parentOf, foldedSet))
        .map(row => {
            const isFolded = row.kind === 'section' && foldedSet.has(row.id)
            const cells = isFolded ? (subtotalCells.get(row.id) ?? row.cells) : row.cells
            return { row, cells, isFolded }
        })
}

export function sectionIds(rows: readonly ReportModelRow[]): string[] {
    return rows.filter(row => row.kind === 'section').map(row => row.id)
}

function isAllFolded(sections: readonly string[], folded: readonly string[]): boolean {
    const foldedSet = new Set(folded)
    return sections.every(id => foldedSet.has(id))
}

export function foldAllLabel(
    rows: readonly ReportModelRow[],
    folded: readonly string[]
): 'Collapse all' | 'Expand all' | null {
    const sections = sectionIds(rows)
    if (sections.length === 0) return null
    return isAllFolded(sections, folded) ? 'Expand all' : 'Collapse all'
}

export function foldAllTarget(
    rows: readonly ReportModelRow[],
    folded: readonly string[]
): string[] {
    const sections = sectionIds(rows)
    return isAllFolded(sections, folded) ? [] : sections
}
