import type { BooksJournalEntries, BooksJournalLines } from '../types'
import { ownBalance } from './account-tree'
import { maxStoredAmount } from './money'
import type { RegisterRange } from './register-range'

export type RegisterEntry = Pick<
    BooksJournalEntries,
    'id' | 'number' | 'memo' | 'status' | 'origin' | 'posted_at' | 'reverses' | 'date'
>

export type RegisterEntryLine = Pick<
    BooksJournalLines,
    'id' | 'account' | 'debit' | 'credit' | 'memo' | 'position'
>

export type RegisterSourceLine = Pick<
    BooksJournalLines,
    'id' | 'entry' | 'account' | 'debit' | 'credit' | 'memo' | 'position' | 'date' | 'posted'
> & {
    entryRecord: RegisterEntry | undefined
    entryLines: readonly RegisterEntryLine[]
    reversesNumber: string
}

export type RegisterOrder = 'newest' | 'oldest'

export const defaultOrder: RegisterOrder = 'newest'

export function toggleOrder(order: RegisterOrder): RegisterOrder {
    return order === 'newest' ? 'oldest' : 'newest'
}

export type RegisterLine<L extends RegisterSourceLine = RegisterSourceLine> = {
    id: string
    entryId: string
    date: string
    number: string
    typeLabel: string
    isVoid: boolean
    memo: string
    otherAccountId: string | null
    isSplit: boolean
    debit: number
    credit: number
    balance: number | null
    source: L
}

export type Register<L extends RegisterSourceLine = RegisterSourceLine> = {
    rows: RegisterLine<L>[]
    openingBalance: number | null
    endingBalance: number | null
    showOpeningRow: boolean
}

export type EntryDetail = {
    date: string
    number: string
    typeLabel: string
    statusLabel: string
    memo: string
    lines: {
        id: string
        accountId: string
        debit: number
        credit: number
        memo: string
        isThisAccount: boolean
    }[]
}

const originLabels: Record<string, string> = {
    manual: 'Journal entry',
    reversal: 'Reversal',
    void_reversal: 'Void reversal',
    auto_reversal: 'Auto reversal',
    opening_balance: 'Opening balances',
}

const reversalOrigins = new Set(['reversal', 'void_reversal', 'auto_reversal'])

export function entryTypeLabel(origin: string, reversesNumber: string): string {
    const label = originLabels[origin] ?? originLabels.manual
    if (!reversalOrigins.has(origin) || !reversesNumber) return label
    return `${label} of ${reversesNumber}`
}

const statusLabels: Record<string, string> = {
    posted: 'Posted',
    void: 'Void',
    draft: 'Draft',
}

function compareText(a: string, b: string): number {
    if (a < b) return -1
    return a > b ? 1 : 0
}

function compareLines(a: RegisterSourceLine, b: RegisterSourceLine): number {
    return (
        compareText(a.date, b.date) ||
        compareText(a.entryRecord?.posted_at ?? '', b.entryRecord?.posted_at ?? '') ||
        a.position - b.position ||
        compareText(a.id, b.id)
    )
}

function otherAccountOf(line: RegisterSourceLine): string | null {
    if (line.entryLines.length !== 2) return null
    return line.entryLines.find(l => l.id !== line.id)?.account ?? null
}

function toRegisterLine<L extends RegisterSourceLine>(
    line: L,
    balance: number | null
): RegisterLine<L> {
    const entry = line.entryRecord
    return {
        id: line.id,
        entryId: line.entry,
        date: line.date,
        number: entry?.number ?? '',
        typeLabel: entryTypeLabel(entry?.origin ?? 'manual', line.reversesNumber),
        isVoid: entry?.status === 'void',
        memo: line.memo || entry?.memo || '',
        otherAccountId: otherAccountOf(line),
        isSplit: line.entryLines.length > 2,
        debit: line.debit,
        credit: line.credit,
        balance,
        source: line,
    }
}

export function buildRegister<L extends RegisterSourceLine>(input: {
    accountType: string
    lines: readonly L[]
    priorTotals: { debit: number; credit: number }
    range: RegisterRange
    order: RegisterOrder
}): Register<L> {
    const { accountType, priorTotals, range, order } = input
    const sorted = input.lines.filter(l => l.posted).sort(compareLines)

    const prior = ownBalance(accountType, priorTotals.debit, priorTotals.credit)
    let running: number | null = Math.abs(prior) > maxStoredAmount ? null : prior
    let openingBalance: number | null = running
    const rows: RegisterLine<L>[] = []

    for (const line of sorted) {
        if (line.date > range.end) continue
        const signed = ownBalance(accountType, line.debit, line.credit)
        const next: number | null = running === null ? null : running + signed
        running = next !== null && Math.abs(next) > maxStoredAmount ? null : next
        if (line.date < range.start) {
            openingBalance = running
            continue
        }
        rows.push(toRegisterLine(line, running))
    }

    const endingBalance = rows.length > 0 ? rows[rows.length - 1].balance : openingBalance
    if (order === 'newest') rows.reverse()
    return {
        rows,
        openingBalance,
        endingBalance,
        showOpeningRow: openingBalance !== 0 || rows.length > 0,
    }
}

export function balanceTone(balance: number | null): string {
    return balance === null ? 'text-danger' : 'text-foreground'
}

export function entryNumberLabel(number: string): string {
    return number === '' ? '—' : number
}

export function entryDetail(line: RegisterSourceLine, accountId: string): EntryDetail | null {
    const entry = line.entryRecord
    if (!entry) return null
    return {
        date: entry.date,
        number: entry.number,
        typeLabel: entryTypeLabel(entry.origin, line.reversesNumber),
        statusLabel: statusLabels[entry.status] ?? entry.status,
        memo: entry.memo,
        lines: [...line.entryLines]
            .sort((a, b) => a.position - b.position)
            .map(l => ({
                id: l.id,
                accountId: l.account,
                debit: l.debit,
                credit: l.credit,
                memo: l.memo,
                isThisAccount: l.account === accountId,
            })),
    }
}
