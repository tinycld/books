// Readers of a forms-engine value whose shape the engine does not type (`unknown`): a
// text field's value, a table built-in's rows. Plain: type imports only.

import type { TableRow } from '@tinycld/core/lib/forms/values'

// A form value as text: '' for anything that is not a string.
export function textOf(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

export function isTableRow(value: unknown): value is TableRow {
    return typeof value === 'object' && value !== null && 'id' in value
}

// A table built-in's form value as its rows: [] for anything that is not a list.
export function rowsOf(value: unknown): TableRow[] {
    if (!Array.isArray(value)) return []
    const list: unknown[] = value
    return list.filter(isTableRow)
}
