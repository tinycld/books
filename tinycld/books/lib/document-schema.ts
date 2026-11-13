// A sales document's record rules, run by the forms engine after the host's field and row
// schemas (`FormHostUi.recordSchema`), so every message is a field error of the same
// resolver. Core already checks each row kind's required cells; these are the rules core
// cannot read from the host: the quantity's bounds and decimals, the typed rate and
// percent, the text lengths in code points, an invoice's due date against its date, a
// sales receipt's Deposit to and Reference no., an estimate's Expiration date, Accepted
// date and Accepted by, the percent target and the totals. The texts are the kind's (`kind.messages`). The host's
// columns carry no bounds, so each cell shows one message, from here.
//
// Each line table's rows are checked under the table's key; a kind with several tables
// (a bill's account and product lines) sums them into one set of totals. An account
// line's typed Amount may be negative, never 0. The total rules report at the first
// table's key, so their message shows under it. They run only when every cell parses, as
// a total of half-typed cells means nothing.
// The record holds only the tax rate's id, so the form passes the chosen tax; without
// it the totals checked are the line totals, and the server checks the total with tax.

import type { TableRow } from '@tinycld/core/lib/forms/values'
import { z } from '@tinycld/core/ui/form'
import type { ZodTypeAny } from 'zod'
import { percentTextToPpm } from './document-line-columns'
import { type DocumentTax, documentTotals, MAX_DOCUMENT_LINES } from './document-lines'
import { type DocumentMessages, ESTIMATE_MESSAGES, INVOICE_MESSAGES } from './document-messages'
import { DOCUMENT_NOTE_TOO_LONG } from './document-notes'
import { ACCOUNT_AMOUNT_MESSAGES } from './document-texts'
import { documentLinesOf, lineTableRows } from './document-values'
import { acceptanceShown } from './estimate-status'
import { moneyInputCents } from './money-input'
import { isWellFormedMoney, maxLineAmount, maxStoredAmount } from './money-text'
import { isIsoDay } from './register-range'
import type { SalesDocumentKind } from './sales-document-kinds'

export type DocumentSaveMode = 'draft' | 'post'

// How the form draws Deposit to (a sales receipt's): whether the chart offers any
// deposit account, and whether "Sales deposited to" hides the field. An invoice has no
// Deposit to and passes none.
export type DepositRule = { hasOptions: boolean; hidden: boolean }

// The server counts text in code points (PocketBase text max), not UTF-16 units.
const MAX_TEXT = 4000
// The books_invoice_lines schema's `quantity` max; server/sales_documents.go refuses 0 or less.
const MAX_QUANTITY = 1_000_000
const MIN_PERCENT_PPM = -1_000_000
const MAX_PERCENT_PPM = 10_000_000
const PERCENT_DECIMALS = /^-?\d+\.\d{5,}\s*%?$/

type Issue = { path: (string | number)[]; message: string }

function textOf(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

function isTooLong(value: unknown): boolean {
    return [...textOf(value)].length > MAX_TEXT
}

function quantityMessage(value: unknown, messages: DocumentMessages): string | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return messages.quantityNotPositive
    }
    if (value > MAX_QUANTITY) return messages.quantityTooLarge
    const hundredths = value * 100
    return Math.abs(hundredths - Math.round(hundredths)) > 1e-6 ? messages.quantityDecimals : null
}

function rateMessage(value: unknown, currency: string, messages: DocumentMessages): string | null {
    if (value === null || value === undefined) return null
    if (typeof value !== 'string') return messages.rateMalformed
    if (value.trim() !== '' && !isWellFormedMoney(value, currency)) {
        return messages.rateMalformed
    }
    const cents = moneyInputCents(value, currency)
    return cents === null || Math.abs(cents) > maxLineAmount ? messages.rateTooLarge : null
}

// An empty percent is core's "Percent is required" (the Percent kind requires it).
function percentMessage(value: unknown, messages: DocumentMessages): string | null {
    const text = textOf(value).trim()
    if (text === '') return null
    if (PERCENT_DECIMALS.test(text)) return messages.percentDecimals
    const ppm = percentTextToPpm(text)
    if (ppm === null || ppm < MIN_PERCENT_PPM || ppm > MAX_PERCENT_PPM) {
        return messages.percentRange
    }
    return null
}

// An account line's typed Amount: well formed, not 0, and inside the line limit. An
// empty amount is core's "Amount is required" (the account kind requires it).
function accountAmountMessage(value: unknown, currency: string): string | null {
    if (value === null || value === undefined) return null
    if (typeof value !== 'string') return ACCOUNT_AMOUNT_MESSAGES.malformed
    if (value.trim() === '') return null
    if (!isWellFormedMoney(value, currency)) return ACCOUNT_AMOUNT_MESSAGES.malformed
    const cents = moneyInputCents(value, currency)
    if (cents === null || Math.abs(cents) > maxLineAmount) return ACCOUNT_AMOUNT_MESSAGES.tooLarge
    return cents === 0 ? ACCOUNT_AMOUNT_MESSAGES.zero : null
}

function cellIssues(
    tableKey: string,
    row: TableRow,
    index: number,
    currency: string,
    messages: DocumentMessages
): Issue[] {
    const issues: Issue[] = []
    const add = (column: string, message: string | null) => {
        if (message !== null) issues.push({ path: [tableKey, index, column], message })
    }
    if (row.kind === 'item') {
        add('quantity', quantityMessage(row.quantity, messages))
        add('rate', rateMessage(row.rate, currency, messages))
    }
    if (row.kind === 'percent') add('percent', percentMessage(row.percent, messages))
    if (row.kind === 'account') add('amount', accountAmountMessage(row.amount, currency))
    if (row.kind !== 'subtotal' && isTooLong(row.description)) {
        add('description', 'Description is too long')
    }
    return issues
}

// A percent line applies to the line right above it in its own table.
function percentTargetIssues(
    tableKey: string,
    lines: readonly TableRow[],
    messages: DocumentMessages
): Issue[] {
    const totals = documentTotals(documentLinesOf(lines), null)
    return totals.percentTargetErrors.map(index => ({
        path: [tableKey, index, 'percent'],
        message: messages.percentTarget,
    }))
}

// The totals over every table's lines, reported at the first table. Run only when every
// cell parses, as a total of half-typed cells means nothing.
function totalIssues(
    path: string,
    lines: readonly TableRow[],
    tax: DocumentTax,
    messages: DocumentMessages
): Issue[] {
    const totals = documentTotals(documentLinesOf(lines), tax)
    const overLimit =
        totals.isTooLarge ||
        Math.abs(totals.subtotal) > maxStoredAmount ||
        Math.abs(totals.total) > maxStoredAmount
    if (overLimit) return [{ path: [path], message: messages.totalTooLarge }]
    if (totals.total < 0) return [{ path: [path], message: messages.totalNegative }]
    return []
}

function dayOf(value: unknown): string {
    return textOf(value).slice(0, 10)
}

// Only an invoice has a due date.
function dueDateIssues(kind: SalesDocumentKind, values: Record<string, unknown>): Issue[] {
    if (kind.key !== 'invoice') return []
    const date = dayOf(values.date)
    const due = dayOf(values.due_date)
    if (!isIsoDay(date) || !isIsoDay(due) || due >= date) return []
    return [{ path: ['due_date'], message: INVOICE_MESSAGES.dueBeforeDate }]
}

// The books_estimates schema's `accepted_by` max, in code points as the server counts it.
const MAX_ACCEPTED_BY = 200

// Only an estimate has Expiration date and the acceptance fields. Expiration date may be
// empty and must not be before the estimate date; Accepted date is required while Status
// is Accepted (the only status that draws it).
function estimateIssues(kind: SalesDocumentKind, values: Record<string, unknown>): Issue[] {
    if (kind.key !== 'estimate') return []
    const issues: Issue[] = []
    const date = dayOf(values.date)
    const expiration = dayOf(values.expiration_date)
    if (isIsoDay(date) && isIsoDay(expiration) && expiration < date) {
        issues.push({ path: ['expiration_date'], message: ESTIMATE_MESSAGES.expirationBeforeDate })
    }
    const isAccepted = acceptanceShown(textOf(values.status))
    if (isAccepted && dayOf(values.accepted_date) === '') {
        issues.push({ path: ['accepted_date'], message: ESTIMATE_MESSAGES.acceptedDateRequired })
    }
    if ([...textOf(values.accepted_by)].length > MAX_ACCEPTED_BY) {
        issues.push({ path: ['accepted_by'], message: ESTIMATE_MESSAGES.acceptedByTooLong })
    }
    return issues
}

// The books_sales_receipts schema's `reference_no` max, in code points as the server
// counts it.
const MAX_REFERENCE = 40

// Only a sales receipt has a payment row. Deposit to is required while it is drawn ("Ask");
// while "Sales deposited to" names an account it is hidden and the server stamps that
// account on the receipt. With no deposit account in the chart the text says to add one.
function paymentIssues(
    kind: SalesDocumentKind,
    values: Record<string, unknown>,
    deposit: DepositRule | undefined
): Issue[] {
    if (kind.key !== 'sales_receipt') return []
    const { messages } = kind
    const issues: Issue[] = []
    const isDepositMissing =
        deposit !== undefined && !deposit.hidden && textOf(values.deposit_to) === ''
    if (isDepositMissing) {
        const message = deposit.hasOptions ? messages.depositRequired : messages.depositNone
        if (message) issues.push({ path: ['deposit_to'], message })
    }
    if ([...textOf(values.reference_no)].length > MAX_REFERENCE && messages.referenceTooLong) {
        issues.push({ path: ['reference_no'], message: messages.referenceTooLong })
    }
    return issues
}

// A line that counts for Post: an item with a product, or an account line with an account.
function isPostableLine(row: TableRow): boolean {
    if (row.kind === 'item') return textOf(row.product).trim() !== ''
    if (row.kind === 'account') return textOf(row.account).trim() !== ''
    return false
}

// Post's line-count rule: its text and the table it shows under. The caller names them
// by the tables its form shows; by default, the kind's needItemLine under its first table.
export type PostLineRule = { message: string; tableKey: string }

function documentIssues(
    kind: SalesDocumentKind,
    values: Record<string, unknown>,
    currency: string,
    mode: DocumentSaveMode,
    tax: DocumentTax,
    deposit: DepositRule | undefined,
    postLineRule: PostLineRule
): Issue[] {
    const { messages } = kind
    const tables = kind.lineTables.map(table => ({
        key: table.key,
        rows: lineTableRows(values, table.key),
    }))
    const firstKey = tables[0]?.key ?? 'lines'
    const lines = tables.flatMap(table => table.rows)
    const cells = tables.flatMap(table =>
        table.rows.flatMap((row, index) => cellIssues(table.key, row, index, currency, messages))
    )
    const issues: Issue[] = [
        ...dueDateIssues(kind, values),
        ...paymentIssues(kind, values, deposit),
        ...estimateIssues(kind, values),
        ...cells,
    ]
    if (lines.length > MAX_DOCUMENT_LINES) {
        issues.push({ path: [firstKey], message: messages.tooManyLines })
    }
    issues.push(...tables.flatMap(table => percentTargetIssues(table.key, table.rows, messages)))
    if (cells.length === 0) issues.push(...totalIssues(firstKey, lines, tax, messages))
    if (isTooLong(values.message)) {
        issues.push({ path: ['message'], message: DOCUMENT_NOTE_TOO_LONG.message })
    }
    if (isTooLong(values.memo)) {
        issues.push({ path: ['memo'], message: DOCUMENT_NOTE_TOO_LONG.memo })
    }
    if (mode === 'post' && !lines.some(isPostableLine)) {
        issues.push({ path: [postLineRule.tableKey], message: postLineRule.message })
    }
    return issues
}

// Save draft and Post share every rule; Post adds one: at least one line to post (an Item
// line with a product, or an account line with an account), its text and place from
// `postLineRule` (default: the kind's needItemLine under its first table). `tax` is the
// header's chosen tax; absent, the totals are checked without it. `deposit` is how a
// sales receipt draws Deposit to; the invoice passes none.
export function documentSchema(
    kind: SalesDocumentKind,
    currency: string,
    mode: DocumentSaveMode,
    tax: DocumentTax = null,
    deposit?: DepositRule,
    postLineRule: PostLineRule = {
        message: kind.messages.needItemLine,
        tableKey: kind.lineTables[0]?.key ?? 'lines',
    }
): ZodTypeAny {
    return z
        .object({})
        .passthrough()
        .superRefine((values, ctx) => {
            const issues = documentIssues(kind, values, currency, mode, tax, deposit, postLineRule)
            for (const issue of issues) {
                ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
            }
        })
}
