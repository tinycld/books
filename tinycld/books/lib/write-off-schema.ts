// The write-off dialog's one zod schema, its texts and its pure choices (write-off spec
// §3.2, §3.3). The date, account and memo rules share their cases with the Go create guard
// (server/testdata/write_off_cases.json, server/write_offs.go); the bounds are the same on
// both sides.

import { z } from '@tinycld/core/ui/form'
import { closedThroughMessage } from './opening-balances-messages'
import { formatDay, isIsoDay } from './register-range'

// The most characters a write-off's reason holds: the migration's memo field and Go's
// maxWriteOffMemo (server/write_offs.go), which counts runes, as reasonLength does.
export const WRITE_OFF_MEMO_MAX = 4000

export const WRITE_OFF_MESSAGES = {
    dateInvalid: 'Enter a date',
    // `day` is the invoice date in words (formatDay); Go's msgWriteOffDate has the same text.
    dateBeforeInvoice: (day: string) => `Date the write-off on or after the invoice date, ${day}.`,
    accountRequired: 'Choose an account',
    // Go's msgWriteOffMemoTooLong.
    memoTooLong: `A reason can have at most ${WRITE_OFF_MEMO_MAX} characters`,
    noExpenseAccount: 'Add an expense account to the chart of accounts',
    loadError: 'Books could not load the accounts for the write-off.',
} as const

export type WriteOffValues = { date: string; account: string; memo: string }

export type WriteOffSchemaInput = {
    // The invoice's date: the write-off is never dated before it.
    invoiceDate: string
    // The settings' close date ('' with none): the write-off is dated after it.
    closeDate: string
    // The user holds an unexpired close-date override, which lifts the close-date rule.
    hasOverride: boolean
}

// A count of code points, as Go's utf8.RuneCountInString counts the same text.
function reasonLength(memo: string): number {
    return Array.from(memo).length
}

// The date rules in the spec's order; the first that fails is the one message.
function dateMessage(date: string, input: WriteOffSchemaInput): string | null {
    if (!isIsoDay(date)) return WRITE_OFF_MESSAGES.dateInvalid
    if (date < input.invoiceDate) {
        return WRITE_OFF_MESSAGES.dateBeforeInvoice(formatDay(input.invoiceDate))
    }
    if (input.closeDate !== '' && date <= input.closeDate && !input.hasOverride) {
        return closedThroughMessage(input.closeDate)
    }
    return null
}

export function writeOffSchema(
    input: WriteOffSchemaInput
): z.ZodType<WriteOffValues, WriteOffValues> {
    return z
        .object({
            date: z.string(),
            account: z.string().min(1, WRITE_OFF_MESSAGES.accountRequired),
            memo: z.string(),
        })
        .superRefine((values, ctx) => {
            const dateIssue = dateMessage(values.date, input)
            if (dateIssue !== null) {
                ctx.addIssue({ code: 'custom', path: ['date'], message: dateIssue })
            }
            if (reasonLength(values.memo) > WRITE_OFF_MEMO_MAX) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['memo'],
                    message: WRITE_OFF_MESSAGES.memoTooLong,
                })
            }
        })
}

// Today, or the invoice date when that is later than today (a write-off is never dated
// before its invoice).
export function writeOffDefaultDate(today: string, invoiceDate: string): string {
    return invoiceDate > today ? invoiceDate : today
}

// The account of the newest posted write-off when the list still offers it; else the first
// offered account with detail type `bad_debts` (the options are in chart order); else ''.
export function writeOffDefaultAccount(
    options: readonly { id: string; detail_type: string }[],
    newestAccount: string
): string {
    if (newestAccount !== '' && options.some(option => option.id === newestAccount)) {
        return newestAccount
    }
    return options.find(option => option.detail_type === 'bad_debts')?.id ?? ''
}

export type WriteOffDialogBody = 'loading' | 'load-error' | 'no-account' | 'form'

export type WriteOffDialogState = {
    body: WriteOffDialogBody
    canSubmit: boolean
    fieldsDisabled: boolean
    // The loaded invoice has no open balance any more (a payment took it to 0, or it was
    // voided): the dialog shows "Invoice <number> has no open balance." and cannot submit.
    noBalance: boolean
}

// What the dialog's body draws and whether its action button and fields take input. A
// failed read wins over one still loading: Retry recovers both. Until the invoice row lands
// the dialog loads (its figure is the invoice's balance). A loaded invoice that is no longer
// open for a write-off (writeOffOffered) keeps the form but cannot submit.
export function writeOffDialogState(input: {
    isLoading: boolean
    hasLoadError: boolean
    isInvoiceLoaded: boolean
    isInvoiceOpen: boolean
    optionCount: number
    writesAvailable: boolean
    isHeld: boolean
}): WriteOffDialogState {
    if (input.hasLoadError) {
        return { body: 'load-error', canSubmit: false, fieldsDisabled: true, noBalance: false }
    }
    if (input.isLoading || !input.isInvoiceLoaded) {
        return { body: 'loading', canSubmit: false, fieldsDisabled: true, noBalance: false }
    }
    // While the dialog's own write runs, that write takes the balance to 0 before its answer
    // lands: no notice then.
    const noBalance = !input.isInvoiceOpen && !input.isHeld
    if (input.optionCount === 0) {
        return { body: 'no-account', canSubmit: false, fieldsDisabled: input.isHeld, noBalance }
    }
    return {
        body: 'form',
        canSubmit: input.writesAvailable && !input.isHeld && input.isInvoiceOpen,
        fieldsDisabled: input.isHeld,
        noBalance,
    }
}

// The text of the no-balance notice: Go's msgWriteOffNoBalance (server/write_offs.go).
export function writeOffNoBalanceText(number: string): string {
    return `Invoice ${number} has no open balance.`
}

const FIELD_KEYS = ['date', 'account', 'memo'] as const

type WriteOffField = (typeof FIELD_KEYS)[number]

function isWriteOffField(key: string): key is WriteOffField {
    return FIELD_KEYS.some(field => field === key)
}

// Where a server refusal shows: one keyed `date`, `account` or `memo` under its field;
// every other key (`invoice`, `amount`, the sequence, the totals limit) and no key in the
// dialog's error summary.
export function writeOffRefusalTarget(key: string): WriteOffField | 'root' {
    return isWriteOffField(key) ? key : 'root'
}

export type WriteOffRefusalError = { target: WriteOffField | 'root'; message: string }

// The form errors of one server refusal: each field refusal under its field, in input
// order, then ONE root error that joins every other message with a space, since the form
// holds one root error.
export function writeOffRefusalErrors(fields: Record<string, string>): WriteOffRefusalError[] {
    const entries = Object.entries(fields)
    const fieldErrors: WriteOffRefusalError[] = []
    const rootMessages: string[] = []
    for (const [key, message] of entries) {
        const target = writeOffRefusalTarget(key)
        if (target === 'root') rootMessages.push(message)
        else fieldErrors.push({ target, message })
    }
    if (rootMessages.length === 0) return fieldErrors
    return [...fieldErrors, { target: 'root', message: rootMessages.join(' ') }]
}
