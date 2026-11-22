// The deposit form's values (bank deposit spec §3.3 to §3.6): the header fields, the ticked
// items as `{ line }`, and the other funds lines with their amounts as typed text. Stored
// items and lines come in position order, so a row's rank in `items` or `lines` is its
// refusal key (`items.<n>`, `lines.<n>.<field>`; Decisions, Refusal keys).

import { newRecordId } from 'pbtsdb/core'
import type { BooksDepositItems, BooksDepositLines, BooksDeposits } from '../types'
import { type DepositAccountRow, defaultBankAccount } from './deposit-accounts'
import { centsToText } from './money-text'

export type DepositLineValues = {
    // The line's row id: the stored row's id for a stored line, a new id for a line added
    // in the form or for each line of a correction. The save plans the lines by it
    // (insert, update, delete), never by index.
    id: string
    customer: string
    vendor: string
    account: string
    description: string
    // The Amount cell's text; integer cents only once it parses (lib/money-input.ts).
    amount: string
}

export type DepositFormValues = {
    deposit_to: string
    date: string
    memo: string
    items: { line: string }[]
    lines: DepositLineValues[]
}

// A new deposit: the first active bank account in chart order, today, nothing ticked.
export function depositDefaults(input: {
    accounts: readonly DepositAccountRow[]
    today: string
}): DepositFormValues {
    return {
        deposit_to: defaultBankAccount(input.accounts),
        date: input.today,
        memo: '',
        items: [],
        lines: [],
    }
}

// A line "Add line" (and ⌥↵, and Enter in the last Amount) adds: a new row id, no party,
// no account, no description and an empty Amount.
export function newDepositLine(): DepositLineValues {
    return { id: newRecordId(), customer: '', vendor: '', account: '', description: '', amount: '' }
}

function byPosition<R extends { position: number }>(rows: readonly R[]): R[] {
    return [...rows].sort((a, b) => a.position - b.position)
}

type StoredLine = Pick<
    BooksDepositLines,
    'id' | 'customer' | 'vendor' | 'account' | 'description' | 'amount' | 'position'
>

// A stored deposit's values: every stored item ticked and each line, with its row id,
// its amount as the text the Amount cell shows ("12.40", "-15.00"), so parsing it gives
// back the stored cents.
export function depositValuesOf(
    deposit: Pick<BooksDeposits, 'deposit_to' | 'date' | 'memo'>,
    items: readonly Pick<BooksDepositItems, 'line' | 'position'>[],
    lines: readonly StoredLine[]
): DepositFormValues {
    return {
        deposit_to: deposit.deposit_to,
        date: deposit.date.slice(0, 10),
        memo: deposit.memo,
        items: byPosition(items).map(item => ({ line: item.line })),
        lines: byPosition(lines).map(line => ({
            id: line.id,
            customer: line.customer,
            vendor: line.vendor,
            account: line.account,
            description: line.description,
            amount: centsToText(line.amount),
        })),
    }
}

// A correction's start values (spec §3.7, Correction): the posted original's values with
// a new row id for each line, since the correction is a new deposit that writes its own
// line rows and the original's rows stay with the original.
export function correctionValuesOf(
    original: Pick<BooksDeposits, 'deposit_to' | 'date' | 'memo'>,
    items: readonly Pick<BooksDepositItems, 'line' | 'position'>[],
    lines: readonly StoredLine[]
): DepositFormValues {
    const values = depositValuesOf(original, items, lines)
    return { ...values, lines: values.lines.map(line => ({ ...line, id: newRecordId() })) }
}
