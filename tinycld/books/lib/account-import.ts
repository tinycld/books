import {
    type ExistingAccount,
    foldName,
    type ResolvedRow,
    resolveRows,
} from './account-import-resolve'
import { ACCOUNT_TYPES } from './account-types'

export type ImportField =
    | 'number'
    | 'name'
    | 'type'
    | 'detail_type'
    | 'parent'
    | 'description'
    | 'inactive'

export const IMPORT_FIELDS: { field: ImportField; label: string; required: boolean }[] = [
    { field: 'number', label: 'Number', required: false },
    { field: 'name', label: 'Name', required: true },
    { field: 'type', label: 'Type', required: true },
    { field: 'detail_type', label: 'Detail type', required: false },
    { field: 'parent', label: 'Parent', required: false },
    { field: 'description', label: 'Description', required: false },
    { field: 'inactive', label: 'Inactive', required: false },
]

export type ColumnMap = Record<ImportField, number | null>

export type { ExistingAccount }

export type ImportRow = {
    line: number
    status: 'ready' | 'skipped' | 'error'
    reason: string | null
    name: string
    number: string
    type: string
    detail_type: string
    parentPath: string
    description: string
    inactive: boolean
}

const synonyms: Record<ImportField, readonly string[]> = {
    number: ['number', 'no', 'accountnumber', 'accountno', 'acct'],
    name: ['name', 'accountname'],
    type: ['type', 'accounttype'],
    detail_type: ['detailtype', 'subtype'],
    parent: ['parent', 'parentaccount'],
    description: ['description', 'notes'],
    inactive: ['inactive', 'isinactive'],
}

// "#" stands for "number" in headers such as "Account #"; plain punctuation stripping would
// leave just "account", which names no field.
function normalizeHeader(text: string): string {
    return text
        .toLowerCase()
        .replace(/#/g, 'number')
        .replace(/[^a-z0-9]/g, '')
}

export function autoMatchColumns(header: string[]): ColumnMap {
    const normalized = header.map(normalizeHeader)
    const taken = new Set<number>()
    const map: ColumnMap = {
        number: null,
        name: null,
        type: null,
        detail_type: null,
        parent: null,
        description: null,
        inactive: null,
    }
    for (const { field } of IMPORT_FIELDS) {
        const index = normalized.findIndex((h, i) => !taken.has(i) && synonyms[field].includes(h))
        if (index === -1) continue
        map[field] = index
        taken.add(index)
    }
    return map
}

const numberPattern = /^[0-9A-Za-z.-]*$/
const limits = { name: 200, number: 20, description: 1000 }

type ParsedRow = {
    name: string
    number: string
    typeText: string
    typeKey: string
    detailText: string
    detailKey: string
    parentRaw: string
    description: string
    inactive: boolean
    // First failing field rule; null when the cells themselves are valid.
    fieldError: string | null
}

function parseInactive(text: string): boolean | null {
    const value = text.toLowerCase()
    if (value === '') return false
    if (['yes', 'true', '1'].includes(value)) return true
    if (['no', 'false', '0'].includes(value)) return false
    return null
}

function parseRow(cells: string[], map: ColumnMap): ParsedRow {
    const cell = (field: ImportField) => {
        const index = map[field]
        return index === null ? '' : (cells[index] ?? '').trim()
    }
    const typeText = cell('type')
    const detailText = cell('detail_type')
    const typeDef = ACCOUNT_TYPES.find(
        t => t.key === typeText.toLowerCase() || t.label.toLowerCase() === typeText.toLowerCase()
    )
    const detailDef = typeDef?.detailTypes.find(
        d =>
            d.key === detailText.toLowerCase() || d.label.toLowerCase() === detailText.toLowerCase()
    )
    const inactive = parseInactive(cell('inactive'))
    const name = cell('name')
    const number = cell('number')
    const description = cell('description')

    let fieldError: string | null = null
    if (name === '') fieldError = 'name required'
    else if (typeText === '') fieldError = 'type required'
    else if (!typeDef) fieldError = 'unknown type'
    else if (detailText === '') fieldError = 'detail type required'
    else if (!detailDef) fieldError = 'detail type not valid for type'
    else if (inactive === null) fieldError = 'inactive must be yes, no, true, false, 1 or 0'
    else if (name.length > limits.name) fieldError = 'name too long'
    else if (number.length > limits.number || !numberPattern.test(number)) {
        fieldError = 'number invalid'
    } else if (description.length > limits.description) fieldError = 'description too long'

    return {
        name,
        number,
        typeText,
        typeKey: typeDef?.key ?? '',
        detailText,
        detailKey: detailDef?.key ?? '',
        parentRaw: cell('parent'),
        description,
        inactive: inactive ?? false,
        fieldError,
    }
}

type Duplicate = { reason: string }

// Rows are checked parents first, file order within a level. Only rows that are still
// ready hold a name or number, so a row that fails frees them for later rows.
function findDuplicates(
    parsed: readonly ParsedRow[],
    resolved: readonly ResolvedRow[],
    existingNumbers: ReadonlySet<string>
): Map<number, Duplicate> {
    const failed = new Map<number, Duplicate>()
    const names = new Set<string>()
    const numbers = new Set<string>()
    const order = resolved
        .map((r, i) => ({ i, level: r.level }))
        .sort((a, b) => a.level - b.level || a.i - b.i)

    for (const { i } of order) {
        const row = resolved[i]
        if (row.status !== 'ready') continue
        const parent = row.parentFile
        if (parent !== null && failed.has(parent)) {
            failed.set(i, { reason: 'parent row has an error' })
            continue
        }
        const nameKey = `${row.parentKey}\u0000${foldName(parsed[i].name)}`
        const number = parsed[i].number
        let reason: string | null = null
        if (names.has(nameKey)) reason = 'duplicate name under one parent'
        else if (number !== '' && numbers.has(number)) reason = 'duplicate number in file'
        else if (number !== '' && existingNumbers.has(number)) {
            reason = 'duplicate number of an existing account'
        }
        if (reason) {
            failed.set(i, { reason })
            continue
        }
        names.add(nameKey)
        if (number !== '') numbers.add(number)
    }
    return failed
}

export function buildImportPreview(input: {
    rows: string[][]
    columnMap: ColumnMap
    existing: readonly ExistingAccount[]
}): ImportRow[] {
    const parsed = input.rows.map(cells => parseRow(cells, input.columnMap))
    const resolved = resolveRows(
        parsed.map(p => ({
            name: p.name,
            typeKey: p.typeKey,
            parentRaw: p.parentRaw,
            fieldError: p.fieldError,
        })),
        input.existing
    )
    const existingNumbers = new Set(input.existing.map(a => a.number.trim()).filter(n => n !== ''))
    const duplicates = findDuplicates(parsed, resolved, existingNumbers)

    return resolved.map((r, i) => {
        const row = parsed[i]
        const duplicate = duplicates.get(i)
        return {
            line: i + 1,
            status: duplicate ? 'error' : r.status,
            reason: duplicate ? duplicate.reason : r.reason,
            name: row.name,
            number: row.number,
            type: row.typeKey || row.typeText,
            detail_type: row.detailKey || row.detailText,
            parentPath: r.parentPath,
            description: row.description,
            inactive: row.inactive,
        }
    })
}

// A parent's path is its child's parentPath. Counting ':' would miscount names that
// hold one, so levels follow that link between ready rows instead.
export function orderForInsert(rows: ImportRow[]): ImportRow[] {
    const ready = rows.filter(row => row.status === 'ready')
    const byPath = new Map<string, ImportRow>()
    for (const row of ready) {
        byPath.set(
            foldName(row.parentPath === '' ? row.name : `${row.parentPath}:${row.name}`),
            row
        )
    }
    const levels = new Map<ImportRow, number>()
    const levelOf = (row: ImportRow): number => {
        const known = levels.get(row)
        if (known !== undefined) return known
        const parent = byPath.get(foldName(row.parentPath))
        const level = parent && parent !== row ? levelOf(parent) + 1 : 0
        levels.set(row, level)
        return level
    }
    return ready
        .map((row, order) => ({ row, order, level: levelOf(row) }))
        .sort((a, b) => a.level - b.level || a.order - b.order)
        .map(entry => entry.row)
}

export const importExampleCsv = [
    'Number,Name,Type,Detail type,Parent,Description,Inactive',
    '1000,Operating account,Bank,Checking,,Main business account,no',
    '1010,Petty cash,Bank,Cash on hand,Operating account,Cash kept in the office,no',
    '4000,Consulting income,Income,Service income,,,',
    '6000,Office supplies,Expense,Office and general,,,',
].join('\n')
