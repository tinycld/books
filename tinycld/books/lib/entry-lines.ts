import { amountText, maxStoredAmount, parseMoney } from './money'

export const maxLines = 200

// `id` is the saved line id, or '' for a line that is not saved yet.
export type EntryFormLine = {
    id: string
    account: string
    debit: string
    credit: string
    memo: string
}

export type LineTotals = {
    debits: number
    credits: number
    difference: number
    isBalanced: boolean
    isTooLarge: boolean
    hasInvalid: boolean
    bigTotal: number
}

export function parseAmountText(text: string): number | null {
    if (text.trim() === '') return 0
    return parseMoney(text)
}

export function sumLines(lines: readonly Pick<EntryFormLine, 'debit' | 'credit'>[]): LineTotals {
    let debits = 0n
    let credits = 0n
    let hasInvalid = false
    for (const line of lines) {
        const debit = parseAmountText(line.debit)
        const credit = parseAmountText(line.credit)
        if (debit === null || credit === null) hasInvalid = true
        debits += BigInt(debit ?? 0)
        credits += BigInt(credit ?? 0)
    }
    const limit = BigInt(maxStoredAmount)
    const isTooLarge = debits > limit || credits > limit
    // A side that is too large is reported as 0; callers read isTooLarge first.
    const debitCents = debits > limit ? 0 : Number(debits)
    const creditCents = credits > limit ? 0 : Number(credits)
    return {
        debits: debitCents,
        credits: creditCents,
        difference: Math.abs(debitCents - creditCents),
        isBalanced: debitCents === creditCents && !isTooLarge && !hasInvalid,
        isTooLarge,
        hasInvalid,
        bigTotal: Math.max(debitCents, creditCents),
    }
}

export function isBlankLine(line: EntryFormLine): boolean {
    return (
        line.account.trim() === '' &&
        line.debit.trim() === '' &&
        line.credit.trim() === '' &&
        line.memo.trim() === ''
    )
}

export function dropBlankLines(lines: readonly EntryFormLine[]): EntryFormLine[] {
    return lines.filter(line => !isBlankLine(line))
}

export function moveLine<T>(lines: readonly T[], index: number, direction: -1 | 1): T[] {
    const target = index + direction
    const next = [...lines]
    if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
}

// Typing in one side empties the other; whitespace is not a value.
export function shouldClearOtherSide(text: string): boolean {
    return text.trim() !== ''
}

export function formatAmountOnBlur(text: string, currency: string): string {
    const cents = parseAmountText(text)
    if (cents === null) return text
    return amountText(cents, currency)
}

function isChanged(saved: EntryFormLine, next: EntryFormLine): boolean {
    return (
        saved.account !== next.account ||
        saved.debit !== next.debit ||
        saved.credit !== next.credit ||
        saved.memo !== next.memo
    )
}

// A saved line is also updated when its index moved, so a reorder, an insert
// before it, or a delete before it is written. Callers store `position` as the
// line's index in `next` for every insert and update. `saved` must be in saved
// position order (position, id) with contiguous positions, as the server and the
// seed write them, because an index change is the position signal.
export function planLineWrites(
    saved: readonly EntryFormLine[],
    next: readonly EntryFormLine[]
): { inserts: EntryFormLine[]; updates: EntryFormLine[]; deletes: string[] } {
    const savedIndex = new Map(saved.map((line, index) => [line.id, index]))
    const keptIds = new Set(next.map(line => line.id))
    const inserts = next.filter(line => line.id === '' || !savedIndex.has(line.id))
    const updates = next.filter((line, index) => {
        const before = savedIndex.get(line.id)
        return before !== undefined && (before !== index || isChanged(saved[before], line))
    })
    const deletes = saved.filter(line => !keptIds.has(line.id)).map(line => line.id)
    return { inserts, updates, deletes }
}
