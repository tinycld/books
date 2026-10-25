export type LineColumn = 'account' | 'debit' | 'credit' | 'memo'

export interface FocusNode {
    focus(): void
}

// Enter walks a line left to right; the memo's Enter moves to the next line's account.
const NEXT_IN_LINE: Record<Exclude<LineColumn, 'memo'>, LineColumn> = {
    account: 'debit',
    debit: 'credit',
    credit: 'memo',
}

export function nextCell(index: number, column: LineColumn): { index: number; column: LineColumn } {
    if (column === 'memo') return { index: index + 1, column: 'account' }
    return { index, column: NEXT_IN_LINE[column] }
}

export const cellKey = (index: number, column: LineColumn) => `${index}:${column}`

// Focus requested for a cell that is not mounted yet (a line just added) is held
// and applied when that cell registers, so no effect has to wait for the render.
export function createFocusRegistry() {
    const nodes = new Map<string, FocusNode>()
    let pending: string | null = null
    return {
        register(index: number, column: LineColumn) {
            const key = cellKey(index, column)
            return (node: FocusNode | null) => {
                if (!node) {
                    nodes.delete(key)
                    return
                }
                nodes.set(key, node)
                if (pending === key) {
                    pending = null
                    node.focus()
                }
            }
        },
        focus(index: number, column: LineColumn) {
            const key = cellKey(index, column)
            const node = nodes.get(key)
            if (node) node.focus()
            else pending = key
        },
    }
}
