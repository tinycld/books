// The deposit form's values (bank deposit spec §3.3 to §3.6): the header fields, the ticked
// items as `{ line }`, and the other funds lines with their amounts as typed text. Stored
// items and lines come in position order, so a row's rank in `items` or `lines` is its
// refusal key (`items.<n>`, `lines.<n>.<field>`; Decisions, Refusal keys).

import type { BooksDepositItems, BooksDepositLines, BooksDeposits } from '../types'
import { type DepositAccountRow, defaultBankAccount } from './deposit-accounts'
import { centsToText } from './money-text'

export type DepositLineValues = {
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

function byPosition<R extends { position: number }>(rows: readonly R[]): R[] {
    return [...rows].sort((a, b) => a.position - b.position)
}

// A stored deposit's values: every stored item ticked and each line's amount as the text
// the Amount cell shows ("12.40", "-15.00"), so parsing it gives back the stored cents.
export function depositValuesOf(
    deposit: Pick<BooksDeposits, 'deposit_to' | 'date' | 'memo'>,
    items: readonly Pick<BooksDepositItems, 'line' | 'position'>[],
    lines: readonly Pick<
        BooksDepositLines,
        'customer' | 'vendor' | 'account' | 'description' | 'amount' | 'position'
    >[]
): DepositFormValues {
    return {
        deposit_to: deposit.deposit_to,
        date: deposit.date.slice(0, 10),
        memo: deposit.memo,
        items: byPosition(items).map(item => ({ line: item.line })),
        lines: byPosition(lines).map(line => ({
            customer: line.customer,
            vendor: line.vendor,
            account: line.account,
            description: line.description,
            amount: centsToText(line.amount),
        })),
    }
}
