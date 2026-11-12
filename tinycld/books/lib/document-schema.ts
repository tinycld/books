// A sales document's record rules, run by the forms engine after the host's field and row
// schemas (`FormHostUi.recordSchema`), so every message is a field error of the same
// resolver. Core already checks each row kind's required cells; these are the rules core
// cannot read from the host: the quantity's bounds and decimals, the typed rate and
// percent, the text lengths in code points, an invoice's due date against its date, a
// sales receipt's Deposit to and Reference no., the percent target and the totals. The texts are the kind's (`kind.messages`). The host's
// columns carry no bounds, so each cell shows one message, from here.
//
// The total rules report at `lines`, so their message shows under the lines table.
// They run only when every cell parses, as a total of half-typed cells means nothing.
// The record holds only the tax rate's id, so the form passes the chosen tax; without
// it the totals checked are the line totals, and the server checks the total with tax.

import type { TableRow } from '@tinycld/core/lib/forms/values'
import { z } from '@tinycld/core/ui/form'
import type { ZodTypeAny } from 'zod'
import { percentTextToPpm } from './document-line-columns'
import { type DocumentTax, documentTotals, MAX_DOCUMENT_LINES } from './document-lines'
import { type DocumentMessages, INVOICE_MESSAGES } from './document-messages'
import { DOCUMENT_NOTE_TOO_LONG } from './document-notes'
import { documentLinesOf } from './document-values'
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

function cellIssues(
    row: TableRow,
    index: number,
    currency: string,
    messages: DocumentMessages
): Issue[] {
    const issues: Issue[] = []
    const add = (column: string, message: string | null) => {
        if (message !== null) issues.push({ path: ['lines', index, column], message })
    }
    if (row.kind === 'item') {
        add('quantity', quantityMessage(row.quantity, messages))
        add('rate', rateMessage(row.rate, currency, messages))
    }
    if (row.kind === 'percent') add('percent', percentMessage(row.percent, messages))
    if (row.kind !== 'subtotal' && isTooLong(row.description)) {
        add('description', 'Description is too long')
    }
    return issues
}

function linesOf(value: unknown): TableRow[] {
    return Array.isArray(value) ? (value as TableRow[]) : []
}

function totalIssues(
    lines: readonly TableRow[],
    cellsParse: boolean,
    tax: DocumentTax,
    messages: DocumentMessages
): Issue[] {
    const totals = documentTotals(documentLinesOf(lines), tax)
    const issues: Issue[] = totals.percentTargetErrors.map(index => ({
        path: ['lines', index, 'percent'],
        message: messages.percentTarget,
    }))
    if (!cellsParse) return issues
    const overLimit =
        totals.isTooLarge ||
        Math.abs(totals.subtotal) > maxStoredAmount ||
        Math.abs(totals.total) > maxStoredAmount
    if (overLimit) issues.push({ path: ['lines'], message: messages.totalTooLarge })
    else if (totals.total < 0) {
        issues.push({ path: ['lines'], message: messages.totalNegative })
    }
    return issues
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

// The books_sales_receipts schema's `reference_no` max, in code points as the server
// counts it.
const MAX_REFERENCE = 40

// Only a sales receipt has a payment row. Deposit to is required while it is drawn: a
// hidden field ("Sales deposited to" names an account) is filled by the save. With no
// deposit account in the chart the text says to add one.
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

function hasItemLine(lines: readonly TableRow[]): boolean {
    return lines.some(row => row.kind === 'item' && textOf(row.product).trim() !== '')
}

function documentIssues(
    kind: SalesDocumentKind,
    values: Record<string, unknown>,
    currency: string,
    mode: DocumentSaveMode,
    tax: DocumentTax,
    deposit: DepositRule | undefined
): Issue[] {
    const { messages } = kind
    const lines = linesOf(values.lines)
    const cells = lines.flatMap((row, index) => cellIssues(row, index, currency, messages))
    const issues: Issue[] = [
        ...dueDateIssues(kind, values),
        ...paymentIssues(kind, values, deposit),
        ...cells,
    ]
    if (lines.length > MAX_DOCUMENT_LINES) {
        issues.push({ path: ['lines'], message: messages.tooManyLines })
    }
    issues.push(...totalIssues(lines, cells.length === 0, tax, messages))
    if (isTooLong(values.message)) {
        issues.push({ path: ['message'], message: DOCUMENT_NOTE_TOO_LONG.message })
    }
    if (isTooLong(values.memo)) {
        issues.push({ path: ['memo'], message: DOCUMENT_NOTE_TOO_LONG.memo })
    }
    if (mode === 'post' && !hasItemLine(lines)) {
        issues.push({ path: ['lines'], message: messages.needItemLine })
    }
    return issues
}

// Save draft and Post share every rule; Post adds one: at least one Item line with a
// product. `tax` is the header's chosen tax; absent, the totals are checked without it.
// `deposit` is how a sales receipt draws Deposit to; the invoice passes none.
export function documentSchema(
    kind: SalesDocumentKind,
    currency: string,
    mode: DocumentSaveMode,
    tax: DocumentTax = null,
    deposit?: DepositRule
): ZodTypeAny {
    return z
        .object({})
        .passthrough()
        .superRefine((values, ctx) => {
            for (const issue of documentIssues(kind, values, currency, mode, tax, deposit)) {
                ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
            }
        })
}
