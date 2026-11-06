// Synthetic General Ledger for the helix reference route and the e2e seed. The
// accounts are the seeded e2e book's (seed-accounts.ts); the run results are typed
// against core's report contract, so tsc checks every field. Money is integer cents.
//
// Two parts stand in for core features that checkpoint 0 builds (spec §4): the
// "Beginning balance" row is a detail row here (F5 adds the row kind `opening`),
// and a balance is the running balance by the account's normal side, computed
// below as the spec's `balance` formula computes it on the server (F1–F3, F6).
import type { DisplayLayout, ParamDef } from '@tinycld/core/reports/lib/spec'
import type {
    CellValue,
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import type { BooksAccounts, BooksJournalLines } from '../types'
import { accountTypeDef } from './account-types'
import { SEED_ACCOUNTS } from './seed-accounts'

export const GENERAL_LEDGER_TITLE = 'General Ledger'
export const GENERAL_LEDGER_HEADING = 'Harbor Lane Design LLC'
// The default period, This month to date, resolved on GENERAL_LEDGER_TODAY.
export const GENERAL_LEDGER_TODAY = '2026-10-28'
export const GENERAL_LEDGER_FROM = '2026-10-01'
const CURRENCY = 'USD'
const SPLIT = '-Split-'

// The params as the shipped spec declares them (server/report_general_ledger.go
// builds the same list in Go; its test pins the Go side).
export const GENERAL_LEDGER_PARAMS: ParamDef[] = [
    {
        id: 'period',
        type: 'dateRange',
        label: 'Period',
        default: { preset: 'thisMonthToDate' },
    },
    {
        id: 'rows',
        type: 'choice',
        label: 'Rows',
        options: [
            { value: 'active', label: 'With activity' },
            { value: 'all', label: 'All' },
        ],
        default: 'active',
    },
    {
        id: 'accounts',
        type: 'choice',
        label: 'Accounts',
        multiple: true,
        optionsFrom: {
            source: 'books.accounts',
            value: [{ field: 'id' }],
            label: [{ field: 'full_name' }],
            group: [{ field: 'type' }],
            groupLabel: 'All {group} accounts',
        },
    },
]

export type GeneralLedgerAccount = Pick<
    BooksAccounts,
    'id' | 'number' | 'full_name' | 'type' | 'inactive'
> & {
    key: string
    /** The balance on the day before the period, by the account's normal side. */
    beginning: number
}

function account(
    key: string,
    id: string,
    beginning: number,
    fullName?: string
): GeneralLedgerAccount {
    const seeded = SEED_ACCOUNTS.find(a => a.key === key)
    if (!seeded) throw new Error(`general-ledger fixture: no seeded account ${key}`)
    return {
        id,
        key,
        number: seeded.number,
        full_name: fullName ?? seeded.name,
        type: seeded.type,
        inactive: seeded.inactive === true,
        beginning,
    }
}

// Chart order: account type in account_types.json order, then number, then full
// name. Beginning balances are a Trial Balance as of September 30 (debit-normal
// 44,801.00 = credit-normal 44,801.00). Office Equipment, Owner's Equity and
// Retained earnings have no line in October: they show under With activity for
// their beginning balance alone. Sales tax payable has nothing: it shows only
// under Rows = All. Old Petty Cash is inactive and never shows.
export const GENERAL_LEDGER_ACCOUNTS: GeneralLedgerAccount[] = [
    account('checking', 'glacct00checkng', 1248000),
    account('savings', 'glacct00savings', 500000),
    account('receivable', 'glacct0receivbl', 750000),
    account('equipment', 'glacct0equipmnt', 210000),
    account('card', 'glacct0000card0', 64012),
    account('sales-tax', 'glacct0salestax', 0),
    account('equity', 'glacct000equity', 3666088),
    account('retained', 'glacct0retained', 300000),
    account('consulting', 'glacct0consultg', 450000),
    account('rent', 'glacct00000rent', 1620000),
    account('software', 'glacct0software', 108000),
    account('design-tools', 'glacct0designtl', 44100, 'Software Subscriptions:Design Tools'),
    account('petty', 'glacct000petty0', 0),
]

/** One posted line as the report shows it: the cells the spec's columns compute. */
export interface GeneralLedgerLine {
    id: string
    account: string
    day: string
    type: string
    number: string
    name: string
    description: string
    split: string
    debit: number
    credit: number
}

interface LineInput {
    account: string
    debit?: number
    credit?: number
    name?: string
    memo?: string
}

interface EntryInput {
    id: string
    day: string
    type: string
    number: string
    memo: string
    lines: LineInput[]
}

const fullNameOf = (key: string) =>
    GENERAL_LEDGER_ACCOUNTS.find(a => a.key === key)?.full_name ?? key

// The register's rules: the other account's full name for a two-line entry, else
// "-Split-"; the line's memo, else the entry's.
function entryLines(entry: EntryInput): GeneralLedgerLine[] {
    return entry.lines.map((line, position) => {
        const other = entry.lines.find((_, i) => i !== position)
        const split = entry.lines.length === 2 && other ? fullNameOf(other.account) : SPLIT
        return {
            id: `${entry.id}${position}`,
            account: line.account,
            day: entry.day,
            type: entry.type,
            number: entry.number,
            name: line.name ?? '',
            description: line.memo ?? entry.memo,
            split,
            debit: line.debit ?? 0,
            credit: line.credit ?? 0,
        }
    })
}

const LONG_CUSTOMER = 'St. Jude Community Hospital Foundation of the Greater Willamette Valley'

// October's posted entries, in posting order. Debits and credits each add to 11,312.30.
const OCTOBER_ENTRIES: EntryInput[] = [
    {
        id: 'glline41',
        day: '2026-10-02',
        type: 'Journal entry',
        number: 'JE-41',
        memo: 'October rent',
        lines: [
            { account: 'rent', debit: 180000 },
            { account: 'checking', credit: 180000 },
        ],
    },
    {
        id: 'glline03',
        day: '2026-10-05',
        type: 'Transfer',
        number: 'TR-3',
        memo: 'Move to savings',
        lines: [
            { account: 'savings', debit: 200000 },
            { account: 'checking', credit: 200000 },
        ],
    },
    {
        id: 'glline42',
        day: '2026-10-09',
        type: 'Journal entry',
        number: 'JE-42',
        memo: 'Payment on invoice 1042 — West Annex renovation drawings',
        lines: [
            { account: 'checking', debit: 320000, name: LONG_CUSTOMER },
            { account: 'receivable', credit: 320000, name: LONG_CUSTOMER },
        ],
    },
    {
        id: 'glline43',
        day: '2026-10-14',
        type: 'Journal entry',
        number: 'JE-43',
        memo: 'October software subscriptions',
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
    },
    {
        id: 'glline44',
        day: '2026-10-20',
        type: 'Journal entry',
        number: 'JE-44',
        memo: 'Q4 retainer',
        lines: [
            { account: 'receivable', debit: 320000, name: 'Northwind Traders' },
            { account: 'consulting', credit: 320000, name: 'Northwind Traders' },
        ],
    },
    {
        id: 'glline45',
        day: '2026-10-22',
        type: 'Journal entry',
        number: 'JE-45',
        memo: 'Stock photo credits',
        lines: [
            { account: 'design-tools', debit: 4330 },
            { account: 'card', credit: 4330 },
        ],
    },
    {
        id: 'glline46',
        day: '2026-10-23',
        type: 'Journal entry',
        number: 'JE-46',
        memo: 'Retainer deposit',
        lines: [
            { account: 'checking', debit: 45000, name: 'Northwind Traders' },
            { account: 'consulting', credit: 45000, name: 'Northwind Traders' },
        ],
    },
    // The void pair: both show, and they cancel in each account's balance.
    {
        id: 'glline47',
        day: '2026-10-24',
        type: 'Void reversal of JE-46',
        number: 'JE-47',
        memo: 'Void: deposited twice',
        lines: [
            { account: 'checking', credit: 45000, name: 'Northwind Traders' },
            { account: 'consulting', debit: 45000, name: 'Northwind Traders' },
        ],
    },
]

export const GENERAL_LEDGER_LINES: GeneralLedgerLine[] = OCTOBER_ENTRIES.flatMap(entryLines)

// With All dates every beginning balance is 0.00, and the balances come from a
// first entry on January 1 instead.
const OPENING_ENTRY: EntryInput = {
    id: 'glline01',
    day: '2026-01-01',
    type: 'Opening balances',
    number: 'JE-1',
    memo: 'Opening balances',
    lines: GENERAL_LEDGER_ACCOUNTS.filter(a => a.beginning !== 0).map(a =>
        isCreditNormal(a)
            ? { account: a.key, credit: a.beginning }
            : { account: a.key, debit: a.beginning }
    ),
}

function isCreditNormal(acct: GeneralLedgerAccount): boolean {
    return accountTypeDef(acct.type)?.normal === 'credit'
}

/** The line's effect on the account's balance, by the account's normal side. */
function ownNet(acct: GeneralLedgerAccount, line: GeneralLedgerLine): number {
    const net = line.debit - line.credit
    return isCreditNormal(acct) ? -net : net
}

const blankZero = (cents: number): number | null => (cents === 0 ? null : cents)

const sumOf = (values: number[]): number | null =>
    values.length === 0 ? null : values.reduce((a, v) => a + v, 0)

export const GENERAL_LEDGER_COLUMNS: ResultColumn[] = [
    {
        id: 'account',
        label: 'Account / Date',
        type: 'relation',
        labelCell: 'account@label',
        labelType: 'text',
    },
    { id: 'type', label: 'Type', type: 'text' },
    { id: 'number', label: 'No.', type: 'text' },
    { id: 'name', label: 'Name', type: 'text' },
    { id: 'description', label: 'Description', type: 'text' },
    { id: 'split', label: 'Split', type: 'text' },
    { id: 'debit', label: 'Debit', type: 'money', currency: CURRENCY, aggregate: 'sum' },
    { id: 'credit', label: 'Credit', type: 'money', currency: CURRENCY, aggregate: 'sum' },
    { id: 'balance', label: 'Balance', type: 'money', currency: CURRENCY },
]

export type RowsChoice = 'active' | 'all'
export type LineSort = 'report' | 'debit-desc'

interface Section {
    acct: GeneralLedgerAccount
    label: string
    beginning: number
    lines: GeneralLedgerLine[]
}

const sectionLabel = (acct: GeneralLedgerAccount) =>
    acct.number ? `${acct.number} ${acct.full_name}` : acct.full_name

const groupId = (acct: GeneralLedgerAccount) => `g:${JSON.stringify([acct.id, CURRENCY])}`

function detailRow(section: string, line: GeneralLedgerLine, balance: number): ResultRow {
    const cells: Record<string, CellValue> = {
        type: line.type,
        number: line.number,
        name: line.name,
        description: line.description,
        split: line.split,
        debit: blankZero(line.debit),
        credit: blankZero(line.credit),
        balance,
    }
    return {
        id: `d:${line.id}`,
        kind: 'detail',
        depth: 1,
        label: line.day,
        labelType: 'date',
        labelValue: line.day,
        section,
        cells,
    }
}

// Running balances follow the report's order (date, posting order, position);
// a viewer sort reorders the rows after, so each line keeps its true balance.
function lineRows(section: Section, sort: LineSort): ResultRow[] {
    const id = groupId(section.acct)
    let balance = section.beginning
    const rows = section.lines.map(line => {
        balance += ownNet(section.acct, line)
        return { line, row: detailRow(id, line, balance) }
    })
    if (sort === 'debit-desc') rows.sort((a, b) => b.line.debit - a.line.debit)
    return rows.map(r => r.row)
}

function endingOf(section: Section): number {
    return section.lines.reduce((b, line) => b + ownNet(section.acct, line), section.beginning)
}

function sectionRows(section: Section, isOpen: boolean, sort: LineSort): ResultRow[] {
    const id = groupId(section.acct)
    const figures = {
        debit: sumOf(section.lines.map(l => l.debit)),
        credit: sumOf(section.lines.map(l => l.credit)),
        balance: endingOf(section),
    }
    const group: ResultRow = {
        id,
        kind: 'group',
        depth: 0,
        label: section.label,
        groupKey: [section.acct.id, CURRENCY],
        expanded: isOpen,
        canExpand: true,
        cells: { account: section.acct.id, 'account@label': section.label, ...figures },
    }
    if (!isOpen) return [group]
    // F5 draws this as row kind `opening`; core today has detail rows only.
    const opening: ResultRow = {
        id: `o:${section.acct.id}`,
        kind: 'detail',
        depth: 1,
        label: 'Beginning balance',
        section: id,
        cells: { balance: section.beginning },
    }
    const subtotal: ResultRow = {
        id: `s:${JSON.stringify([section.acct.id, CURRENCY])}`,
        kind: 'subtotal',
        depth: 0,
        label: `Total ${section.label}`,
        section: id,
        cells: figures,
    }
    return [group, opening, ...lineRows(section, sort), subtotal]
}

function totalRow(lines: GeneralLedgerLine[]): ResultRow {
    return {
        id: `total:${JSON.stringify([CURRENCY])}`,
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: {
            debit: sumOf(lines.map(l => l.debit)),
            credit: sumOf(lines.map(l => l.credit)),
            balance: null,
        },
    }
}

export interface GeneralLedgerInput {
    rows?: RowsChoice
    /** Account ids the Accounts filter keeps. */
    accounts?: string[]
    sort?: LineSort
    /** Every section folded (Collapse all). */
    isCollapsed?: boolean
    isAllDates?: boolean
    /** Only the first sections, as a first page whose next page is loading (F7). */
    sectionLimit?: number
}

function isShown(section: Section, input: GeneralLedgerInput): boolean {
    const { acct } = section
    if (acct.inactive) return false
    if (input.accounts && !input.accounts.includes(acct.id)) return false
    if (input.rows === 'all') return true
    return section.lines.length > 0 || section.beginning !== 0
}

function sectionsOf(input: GeneralLedgerInput): Section[] {
    const lines = input.isAllDates
        ? [...entryLines(OPENING_ENTRY), ...GENERAL_LEDGER_LINES]
        : GENERAL_LEDGER_LINES
    return GENERAL_LEDGER_ACCOUNTS.map(acct => ({
        acct,
        label: sectionLabel(acct),
        beginning: input.isAllDates ? 0 : acct.beginning,
        lines: lines.filter(line => line.account === acct.key),
    })).filter(section => isShown(section, input))
}

function resolvedParams(input: GeneralLedgerInput): ResolvedParam[] {
    const period: ResolvedParam = input.isAllDates
        ? { id: 'period', type: 'dateRange', unset: true }
        : { id: 'period', type: 'dateRange', from: GENERAL_LEDGER_FROM, to: GENERAL_LEDGER_TODAY }
    return [
        period,
        { id: 'rows', type: 'choice', value: input.rows ?? 'active' },
        input.accounts
            ? { id: 'accounts', type: 'choice', list: input.accounts }
            : { id: 'accounts', type: 'choice', unset: true },
    ]
}

export function generalLedgerResult(input: GeneralLedgerInput = {}): RunResult {
    const sections = sectionsOf(input)
    const shown = input.sectionLimit ? sections.slice(0, input.sectionLimit) : sections
    const rows = shown.flatMap(section =>
        sectionRows(section, !input.isCollapsed, input.sort ?? 'report')
    )
    const lines = sections.flatMap(section => section.lines)
    // A page with a next page ends inside the document: the Total comes with the last page.
    const total = input.sectionLimit ? [] : [totalRow(lines)]
    return {
        columns: GENERAL_LEDGER_COLUMNS,
        rows: [...rows, ...total],
        notices: [],
        topics: [
            'collection/books_journal_lines',
            'collection/books_journal_entries',
            'collection/books_accounts',
            'collection/books_customers',
            'collection/books_vendors',
            'collection/books_settings',
        ],
        heading: GENERAL_LEDGER_HEADING,
        page: input.sectionLimit ? { next: 'reference-next-page', size: 200 } : null,
        params: resolvedParams(input),
    }
}

// A period with no posted line and no beginning balance: only the Total row.
export function emptyGeneralLedgerResult(accounts?: string[]): RunResult {
    return {
        ...generalLedgerResult({ accounts }),
        rows: [totalRow([])],
    }
}

export const accountIdOf = (key: string) =>
    GENERAL_LEDGER_ACCOUNTS.find(a => a.key === key)?.id ?? key

// The spec's `display.layouts` (§3 Phone, §5): a phone row wraps onto four lines
// (date · type · No.; Name · Description; Split; Debit · Credit · Balance), a
// tablet row onto two (figures on line 1, the long text on line 2).
export const GENERAL_LEDGER_PHONE_LAYOUT: DisplayLayout = {
    width: 'mobile',
    tracks: 3,
    cells: [
        { col: 'account', line: 1 },
        { col: 'type', line: 1 },
        { col: 'number', line: 1 },
        { col: 'name', line: 2 },
        { col: 'description', line: 2, span: 2 },
        { col: 'split', line: 3, span: 3 },
        { col: 'debit', line: 4 },
        { col: 'credit', line: 4 },
        { col: 'balance', line: 4 },
    ],
}

export const GENERAL_LEDGER_TABLET_LAYOUT: DisplayLayout = {
    width: 'tablet',
    tracks: 12,
    cells: [
        { col: 'account', line: 1, span: 3 },
        { col: 'type', line: 1, span: 2 },
        { col: 'number', line: 1, span: 1 },
        { col: 'debit', line: 1, span: 2 },
        { col: 'credit', line: 1, span: 2 },
        { col: 'balance', line: 1, span: 2 },
        { col: 'name', line: 2, span: 3 },
        { col: 'description', line: 2, span: 5 },
        { col: 'split', line: 2, span: 4 },
    ],
}

// Reference only, standing in for F10 (fit, never clip) until checkpoint 0 builds
// it: the one line at 1280 with the text columns narrowed (about 96 px each, with
// an ellipsis) and the figures at core's full 128 px. Core refuses more than 12
// tracks in a saved spec; F10 measures widths instead, so the GL spec ships no
// desktop layout.
export const F10_ONE_LINE_STAND_IN: DisplayLayout = {
    width: 'desktop',
    tracks: 30,
    cells: [
        { col: 'account', line: 1, span: 4 },
        { col: 'type', line: 1, span: 3 },
        { col: 'number', line: 1, span: 2 },
        { col: 'name', line: 1, span: 3 },
        { col: 'description', line: 1, span: 3 },
        { col: 'split', line: 1, span: 3 },
        { col: 'debit', line: 1, span: 4 },
        { col: 'credit', line: 1, span: 4 },
        { col: 'balance', line: 1, span: 4 },
    ],
}

// Reference only: where the one line does not fit a desktop view even narrowed,
// F10 wraps to the tablet layout.
export const F10_WRAP_STAND_IN: DisplayLayout = {
    ...GENERAL_LEDGER_TABLET_LAYOUT,
    width: 'desktop',
}

// --- e2e seed (wired by the checkpoint that adds the Name to journal lines) ---

// Local shape until the ledger checkpoint (spec §5 "Ledger change", migration
// 2100000002) adds `customer` and `vendor` to books_journal_lines; that checkpoint
// replaces `name` with the generated relation fields.
type SeedPartyLine = Pick<BooksJournalLines, 'debit' | 'credit' | 'memo'> & {
    account: string
    customer?: string
    vendor?: string
}

// Seeded lines that name a customer or a vendor (display names from the customer
// and vendor fixtures), so the Name column shows in the seeded book.
export const GENERAL_LEDGER_PARTY_SEED: { memo: string; lines: SeedPartyLine[] }[] = [
    {
        memo: 'Q4 retainer',
        lines: [
            {
                account: 'receivable',
                debit: 320000,
                credit: 0,
                memo: '',
                customer: 'Northwind Traders',
            },
            {
                account: 'consulting',
                debit: 0,
                credit: 320000,
                memo: '',
                customer: 'Northwind Traders',
            },
        ],
    },
    {
        memo: 'October software subscriptions',
        lines: [
            {
                account: 'software',
                debit: 12000,
                credit: 0,
                memo: 'Project management seats',
                vendor: 'Summit IT Services',
            },
            { account: 'card', debit: 0, credit: 12000, memo: '' },
        ],
    },
]

// One long section, so the first page of 200 detail rows ends inside it (spec §7
// item 8): this many one-dollar transfers from checking to savings.
export const GENERAL_LEDGER_LONG_SECTION = {
    account: 'savings',
    offset: 'checking',
    count: 260,
    cents: 100,
    memo: 'Daily sweep',
}
