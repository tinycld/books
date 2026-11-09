// Synthetic Journal for the helix reference route (spec docs/specs/journal-report-design.md).
// The accounts are the seeded e2e book's (seed-accounts.ts); the entries are typed
// against the generated journal entry record, and the run results against core's
// report contract, so tsc checks every field. Money is integer cents.
//
// The rows are the ones the spec's report (server/report_journal.go) returns: one
// block per posted entry, in entry date, then posting order, then number sequence;
// its lines in position order; a Total row under each block and one at the end.
import type { DisplayLayout, ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    CellValue,
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import type { BooksJournalEntries } from '../types'
import { SEED_ACCOUNTS } from './seed-accounts'

export const JOURNAL_TITLE = 'Journal'
export const JOURNAL_HEADING = 'Harbor Lane Design LLC'
// The default period, This month to date, resolved on JOURNAL_TODAY.
export const JOURNAL_TODAY = '2026-10-28'
export const JOURNAL_FROM = '2026-10-01'
const CURRENCY = 'USD'

// The one param as the shipped spec declares it (§3 Params, Q3, Q4).
export const JOURNAL_PARAMS: ParamDef[] = [
    {
        id: 'period',
        type: 'dateRange',
        label: 'Period',
        default: { preset: 'thisMonthToDate' },
    },
]

// The register's type labels (server/entry_type_labels.json); a reversal names the
// entry it reverses.
const ORIGIN_LABELS: Record<BooksJournalEntries['origin'], string> = {
    manual: 'Journal entry',
    reversal: 'Reversal',
    void_reversal: 'Void reversal',
    auto_reversal: 'Auto reversal',
    opening_balance: 'Opening balances',
}

// Not a seeded account: the one account with no number, so the Account column shows
// the full name alone (§3 Account).
const UNNUMBERED_ACCOUNT = { key: 'undeposited', number: '', name: 'Undeposited Funds' }

function accountLabel(key: string): string {
    if (key === UNNUMBERED_ACCOUNT.key) return UNNUMBERED_ACCOUNT.name
    const seeded = SEED_ACCOUNTS.find(a => a.key === key)
    if (!seeded) throw new Error(`journal-report fixture: no seeded account ${key}`)
    const parent = SEED_ACCOUNTS.find(a => a.key === seeded.parent)
    const fullName = parent ? `${parent.name}:${seeded.name}` : seeded.name
    return seeded.number ? `${seeded.number} ${fullName}` : fullName
}

interface LineInput {
    account: string
    debit?: number
    credit?: number
    name?: string
    memo?: string
}

type EntryFields = Pick<
    BooksJournalEntries,
    'id' | 'date' | 'doc_type' | 'origin' | 'number' | 'sequence' | 'memo' | 'posted_at'
>

interface EntryInput extends EntryFields {
    /** The number of the entry a reversal reverses. */
    reversesNumber?: string
    lines: LineInput[]
}

/** One posted line as the report shows it: the cells the spec's columns compute. */
export interface JournalLine {
    id: string
    date: string
    account: string
    name: string
    description: string
    debit: number
    credit: number
}

/** One block: an entry's heading and its lines in position order. */
export interface JournalBlock {
    entry: EntryInput
    label: string
    lines: JournalLine[]
}

export function entryHeading(entry: EntryInput): string {
    const base = entry.doc_type === 'transfer' ? 'Transfer' : ORIGIN_LABELS[entry.origin]
    const type = entry.reversesNumber ? `${base} of ${entry.reversesNumber}` : base
    return entry.number ? `${entry.number} · ${type}` : type
}

const LONG_CUSTOMER = 'St. Jude Community Hospital Foundation of the Greater Willamette Valley'

function entry(
    fields: Omit<EntryFields, 'doc_type' | 'origin'> &
        Partial<Pick<EntryFields, 'doc_type' | 'origin'>> & {
            reversesNumber?: string
            lines: LineInput[]
        }
): EntryInput {
    return { doc_type: 'journal', origin: 'manual', ...fields }
}

// October's posted entries. Each balances; the report shows them in this order.
// TR-4 is posted after JE-44 on the same day, so posting order puts it below.
// JE-46 is voided: it and its void reversal (the same number) both show (Q5).
const OCTOBER_ENTRIES: EntryInput[] = [
    entry({
        id: 'jrentry0000041',
        date: '2026-10-02',
        number: 'JE-41',
        sequence: 41,
        memo: 'October rent',
        posted_at: '2026-10-02 09:12:00.000Z',
        lines: [
            { account: 'rent', debit: 180000 },
            { account: 'checking', credit: 180000 },
        ],
    }),
    entry({
        id: 'jrentry000tr03',
        date: '2026-10-05',
        doc_type: 'transfer',
        number: 'TR-3',
        sequence: 3,
        memo: 'Move to savings',
        posted_at: '2026-10-05 15:40:00.000Z',
        lines: [
            { account: 'savings', debit: 200000 },
            { account: 'checking', credit: 200000 },
        ],
    }),
    entry({
        id: 'jrentry0000042',
        date: '2026-10-09',
        number: 'JE-42',
        sequence: 42,
        memo: 'Payment on invoice 1042 — West Annex renovation drawings',
        posted_at: '2026-10-09 11:03:00.000Z',
        lines: [
            { account: 'checking', debit: 320000, name: LONG_CUSTOMER },
            { account: 'receivable', credit: 320000, name: LONG_CUSTOMER },
        ],
    }),
    entry({
        id: 'jrentry0000043',
        date: '2026-10-14',
        number: 'JE-43',
        sequence: 43,
        memo: 'October software subscriptions',
        posted_at: '2026-10-14 08:30:00.000Z',
        lines: [
            {
                account: 'software',
                debit: 12000,
                name: 'Summit IT Services',
                memo: 'Project management seats — 12 users, annual plan billed monthly',
            },
            { account: 'design-tools', debit: 4900 },
            { account: 'card', credit: 16900 },
        ],
    }),
    // An entry with no number: its heading is the type alone.
    entry({
        id: 'jrentry000none',
        date: '2026-10-16',
        number: '',
        sequence: 0,
        memo: 'Cash from the October workshop',
        posted_at: '2026-10-16 17:55:00.000Z',
        lines: [
            { account: 'undeposited', debit: 45000 },
            { account: 'consulting', credit: 45000, name: 'Northwind Traders' },
        ],
    }),
    entry({
        id: 'jrentry0000044',
        date: '2026-10-20',
        number: 'JE-44',
        sequence: 44,
        memo: 'Q4 retainer',
        posted_at: '2026-10-20 10:00:00.000Z',
        lines: [
            { account: 'receivable', debit: 320000, name: 'Northwind Traders' },
            { account: 'consulting', credit: 320000, name: 'Northwind Traders' },
        ],
    }),
    entry({
        id: 'jrentry000tr04',
        date: '2026-10-20',
        doc_type: 'transfer',
        number: 'TR-4',
        sequence: 4,
        memo: 'Back to checking for payroll',
        posted_at: '2026-10-20 16:20:00.000Z',
        lines: [
            { account: 'checking', debit: 150000 },
            { account: 'savings', credit: 150000 },
        ],
    }),
    entry({
        id: 'jrentry0000045',
        date: '2026-10-21',
        origin: 'reversal',
        number: 'JE-45',
        sequence: 45,
        reversesNumber: 'JE-44',
        memo: 'Reverse Q4 retainer — billed to the wrong client',
        posted_at: '2026-10-21 09:05:00.000Z',
        lines: [
            { account: 'receivable', credit: 320000, name: 'Northwind Traders' },
            { account: 'consulting', debit: 320000, name: 'Northwind Traders' },
        ],
    }),
    entry({
        id: 'jrentry0000046',
        date: '2026-10-23',
        number: 'JE-46',
        sequence: 46,
        memo: 'Retainer deposit',
        posted_at: '2026-10-23 13:47:00.000Z',
        lines: [
            { account: 'checking', debit: 45000, name: 'Northwind Traders' },
            { account: 'consulting', credit: 45000, name: 'Northwind Traders' },
        ],
    }),
    entry({
        id: 'jrentry00void46',
        date: '2026-10-24',
        origin: 'void_reversal',
        number: 'JE-46',
        sequence: 46,
        reversesNumber: 'JE-46',
        memo: 'Void: deposited twice',
        posted_at: '2026-10-24 08:15:00.000Z',
        lines: [
            { account: 'checking', credit: 45000, name: 'Northwind Traders' },
            { account: 'consulting', debit: 45000, name: 'Northwind Traders' },
        ],
    }),
]

// With All dates the opening balances entry of January 1 comes first.
const OPENING_ENTRY: EntryInput = entry({
    id: 'jrentry0000001',
    date: '2026-01-01',
    origin: 'opening_balance',
    number: 'JE-1',
    sequence: 1,
    memo: 'Opening balances',
    posted_at: '2026-01-04 10:00:00.000Z',
    lines: [
        { account: 'checking', debit: 1248000 },
        { account: 'savings', debit: 500000 },
        { account: 'receivable', debit: 750000 },
        { account: 'equipment', debit: 210000 },
        { account: 'card', credit: 64012 },
        { account: 'equity', credit: 2343988 },
        { account: 'retained', credit: 300000 },
    ],
})

function blockOf(input: EntryInput): JournalBlock {
    return {
        entry: input,
        label: entryHeading(input),
        lines: input.lines.map((line, position) => ({
            id: `${input.id}${position}`,
            date: input.date,
            account: accountLabel(line.account),
            name: line.name ?? '',
            // The line's memo, else the entry's (the register's rule).
            description: line.memo ?? input.memo,
            debit: line.debit ?? 0,
            credit: line.credit ?? 0,
        })),
    }
}

// Entry date, then posting order, then number sequence (Q7).
function byReportOrder(a: EntryInput, b: EntryInput): number {
    return (
        a.date.localeCompare(b.date) ||
        a.posted_at.localeCompare(b.posted_at) ||
        a.sequence - b.sequence
    )
}

export const JOURNAL_BLOCKS: JournalBlock[] = [...OCTOBER_ENTRIES].sort(byReportOrder).map(blockOf)

export const JOURNAL_COLUMNS: ResultColumn[] = [
    {
        id: 'entry',
        label: 'Entry / Date',
        type: 'relation',
        labelCell: 'entry@label',
        labelType: 'text',
        sortable: true,
    },
    { id: 'account', label: 'Account', type: 'text', sortable: true },
    { id: 'name', label: 'Name', type: 'text', sortable: true },
    { id: 'description', label: 'Description', type: 'text', sortable: true },
    {
        id: 'debit',
        label: 'Debit',
        type: 'money',
        currency: CURRENCY,
        aggregate: 'sum',
        sortable: true,
    },
    {
        id: 'credit',
        label: 'Credit',
        type: 'money',
        currency: CURRENCY,
        aggregate: 'sum',
        sortable: true,
    },
]

const blankZero = (cents: number): number | null => (cents === 0 ? null : cents)

const sumOf = (values: number[]): number | null =>
    values.length === 0 ? null : values.reduce((a, v) => a + v, 0)

const keyOf = (block: JournalBlock) => JSON.stringify([block.entry.id, CURRENCY])
const groupId = (block: JournalBlock) => `g:${keyOf(block)}`

export type LineSort = 'report' | 'debit-desc'

function detailRow(section: string, line: JournalLine): ResultRow {
    const cells: Record<string, CellValue> = {
        account: line.account,
        name: line.name,
        description: line.description,
        debit: blankZero(line.debit),
        credit: blankZero(line.credit),
    }
    return {
        id: `d:${line.id}`,
        kind: 'detail',
        depth: 1,
        label: line.date,
        labelType: 'date',
        labelValue: line.date,
        section,
        cells,
    }
}

// A viewer sort reorders the lines inside each block; the blocks keep their order.
// Blank debits go last, as the engine sorts nulls in a descending sort.
function sortedLines(lines: JournalLine[], sort: LineSort): JournalLine[] {
    if (sort === 'report') return lines
    return [...lines].sort((a, b) => b.debit - a.debit)
}

function blockRows(block: JournalBlock, isOpen: boolean, sort: LineSort): ResultRow[] {
    const id = groupId(block)
    const figures = {
        debit: sumOf(block.lines.map(l => l.debit)),
        credit: sumOf(block.lines.map(l => l.credit)),
    }
    const group: ResultRow = {
        id,
        kind: 'group',
        depth: 0,
        label: block.label,
        groupKey: [block.entry.id, CURRENCY],
        expanded: isOpen,
        canExpand: true,
        cells: { entry: block.entry.id, 'entry@label': block.label, ...figures },
    }
    if (!isOpen) return [group]
    const subtotal: ResultRow = {
        id: `s:${keyOf(block)}`,
        kind: 'subtotal',
        depth: 0,
        label: `Total ${block.label}`,
        section: id,
        cells: figures,
    }
    const lines = sortedLines(block.lines, sort).map(line => detailRow(id, line))
    return [group, ...lines, subtotal]
}

function totalRow(lines: JournalLine[]): ResultRow {
    return {
        id: `total:${JSON.stringify([CURRENCY])}`,
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: {
            debit: sumOf(lines.map(l => l.debit)),
            credit: sumOf(lines.map(l => l.credit)),
        },
    }
}

export interface JournalInput {
    sort?: LineSort
    /** Entry ids of the blocks the reader folded. */
    folded?: string[]
    /** Every block folded (Collapse all). */
    isCollapsed?: boolean
    isAllDates?: boolean
    /** Only the first rows, as a first page that ends inside a block, its next page loading. */
    pageRows?: number
}

function blocksOf(input: JournalInput): JournalBlock[] {
    return input.isAllDates ? [blockOf(OPENING_ENTRY), ...JOURNAL_BLOCKS] : JOURNAL_BLOCKS
}

function resolvedParams(input: JournalInput): ResolvedParam[] {
    // All dates is a set range with no bounds, as the server resolves the preset.
    const period: ResolvedParam = input.isAllDates
        ? { id: 'period', type: 'dateRange' }
        : { id: 'period', type: 'dateRange', from: JOURNAL_FROM, to: JOURNAL_TODAY }
    return [period]
}

const isBlockOpen = (block: JournalBlock, input: JournalInput) =>
    !input.isCollapsed && !(input.folded ?? []).includes(block.entry.id)

export function journalResult(input: JournalInput = {}): RunResult {
    const blocks = blocksOf(input)
    const rows = blocks.flatMap(block =>
        blockRows(block, isBlockOpen(block, input), input.sort ?? 'report')
    )
    const lines = blocks.flatMap(block => block.lines)
    // A page with a next page ends inside the document: the block's Total row and
    // the report's Total come with a later page.
    const page = input.pageRows ? rows.slice(0, input.pageRows) : [...rows, totalRow(lines)]
    return {
        columns: JOURNAL_COLUMNS,
        rows: page,
        notices: [],
        topics: [
            'collection/books_journal_lines',
            'collection/books_journal_entries',
            'collection/books_accounts',
            'collection/books_customers',
            'collection/books_vendors',
            'collection/books_settings',
        ],
        heading: JOURNAL_HEADING,
        page: input.pageRows ? { next: 'reference-next-page', size: input.pageRows } : null,
        params: resolvedParams(input),
    }
}

// A period with no posted line: only the Total row, which the view does not count.
export function emptyJournalResult(): RunResult {
    return { ...journalResult(), rows: [totalRow([])] }
}

export const JOURNAL_FOLDED_ENTRY = 'jrentry0000042'

// The spec's `display` (§5): column floors so an ordinary account name (~20
// characters) and a customer name (~16, capped there so Name never takes the room
// Description needs) stay whole, Description takes the most of
// the spare room, figures are never cut. A phone row wraps onto three lines, a
// tablet row onto two. No `oneLine.minWidth` unless phase 3 measured a cut column.
export const JOURNAL_PHONE_LAYOUT: DisplayLayout = {
    width: 'mobile',
    tracks: 3,
    cells: [
        { col: 'entry', line: 1 },
        { col: 'account', line: 1, span: 2 },
        { col: 'name', line: 2 },
        { col: 'description', line: 2, span: 2 },
        // Tracks 2 and 3, so Credit ends at the right edge as the GL's Balance does.
        { col: 'debit', line: 3, start: 2 },
        { col: 'credit', line: 3, start: 3 },
    ],
}

export const JOURNAL_TABLET_LAYOUT: DisplayLayout = {
    width: 'tablet',
    minWidth: '600px',
    tracks: 12,
    cells: [
        { col: 'entry', line: 1, span: 2 },
        { col: 'account', line: 1, span: 4 },
        { col: 'debit', line: 1, span: 3 },
        { col: 'credit', line: 1, span: 3 },
        { col: 'name', line: 2, span: 4 },
        { col: 'description', line: 2, span: 8 },
    ],
}

export const JOURNAL_DISPLAY: NonNullable<ReportSpec['display']> = {
    columns: {
        account: { minWidth: '20ch' },
        name: { minWidth: '16ch', maxWidth: '16ch' },
        description: { flexGrow: 2 },
        debit: { minWidth: 'max-content' },
        credit: { minWidth: 'max-content' },
    },
    layouts: [JOURNAL_PHONE_LAYOUT, JOURNAL_TABLET_LAYOUT],
}

/** What the view reads of the spec's groups: one level, open, ending in a Total row. */
export const JOURNAL_GROUPS = [{ subtotals: true, open: true }]
