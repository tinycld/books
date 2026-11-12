// The invoice's record rules, run by the forms engine after the host's field and row
// schemas (`FormHostUi.recordSchema`), so every message is a field error of the same
// resolver. Core already checks each row kind's required cells; these are the rules core
// cannot read from the host: the quantity's bounds and decimals, the typed rate and
// percent, the text lengths in code points, the due date against the date, the percent
// target and the totals. The host's columns carry no bounds, so each cell shows one
// message, from here.
//
// The total rules report at `lines`, so their message shows under the lines table.
// They run only when every cell parses, as a total of half-typed cells means nothing.
// The record holds only the tax rate's id, so the form passes the chosen tax; without
// it the totals checked are the line totals, and the server checks the total with tax.

import type { TableRow } from '@tinycld/core/lib/forms/values'
import { z } from '@tinycld/core/ui/form'
import type { ZodTypeAny } from 'zod'
import { type DocumentTax, documentTotals, MAX_DOCUMENT_LINES } from './document-lines'
import { percentTextToPpm } from './invoice-lines'
import { INVOICE_MESSAGES } from './invoice-messages'
import { INVOICE_NOTE_TOO_LONG } from './invoice-notes'
import { documentLinesOf } from './invoice-values'
import { moneyInputCents } from './money-input'
import { isWellFormedMoney, maxLineAmount, maxStoredAmount } from './money-text'
import { isIsoDay } from './register-range'

export type InvoiceSaveMode = 'draft' | 'post'

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

function quantityMessage(value: unknown): string | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return INVOICE_MESSAGES.quantityNotPositive
    }
    if (value > MAX_QUANTITY) return INVOICE_MESSAGES.quantityTooLarge
    const hundredths = value * 100
    return Math.abs(hundredths - Math.round(hundredths)) > 1e-6
        ? INVOICE_MESSAGES.quantityDecimals
        : null
}

function rateMessage(value: unknown, currency: string): string | null {
    if (value === null || value === undefined) return null
    if (typeof value !== 'string') return INVOICE_MESSAGES.rateMalformed
    if (value.trim() !== '' && !isWellFormedMoney(value, currency)) {
        return INVOICE_MESSAGES.rateMalformed
    }
    const cents = moneyInputCents(value, currency)
    return cents === null || Math.abs(cents) > maxLineAmount ? INVOICE_MESSAGES.rateTooLarge : null
}

// An empty percent is core's "Percent is required" (the Percent kind requires it).
function percentMessage(value: unknown): string | null {
    const text = textOf(value).trim()
    if (text === '') return null
    if (PERCENT_DECIMALS.test(text)) return INVOICE_MESSAGES.percentDecimals
    const ppm = percentTextToPpm(text)
    if (ppm === null || ppm < MIN_PERCENT_PPM || ppm > MAX_PERCENT_PPM) {
        return INVOICE_MESSAGES.percentRange
    }
    return null
}

function cellIssues(row: TableRow, index: number, currency: string): Issue[] {
    const issues: Issue[] = []
    const add = (column: string, message: string | null) => {
        if (message !== null) issues.push({ path: ['lines', index, column], message })
    }
    if (row.kind === 'item') {
        add('quantity', quantityMessage(row.quantity))
        add('rate', rateMessage(row.rate, currency))
    }
    if (row.kind === 'percent') add('percent', percentMessage(row.percent))
    if (row.kind !== 'subtotal' && isTooLong(row.description)) {
        add('description', 'Description is too long')
    }
    return issues
}

function linesOf(value: unknown): TableRow[] {
    return Array.isArray(value) ? (value as TableRow[]) : []
}

function totalIssues(lines: readonly TableRow[], cellsParse: boolean, tax: DocumentTax): Issue[] {
    const totals = documentTotals(documentLinesOf(lines), tax)
    const issues: Issue[] = totals.percentTargetErrors.map(index => ({
        path: ['lines', index, 'percent'],
        message: INVOICE_MESSAGES.percentTarget,
    }))
    if (!cellsParse) return issues
    const overLimit =
        totals.isTooLarge ||
        Math.abs(totals.subtotal) > maxStoredAmount ||
        Math.abs(totals.total) > maxStoredAmount
    if (overLimit) issues.push({ path: ['lines'], message: INVOICE_MESSAGES.totalTooLarge })
    else if (totals.total < 0) {
        issues.push({ path: ['lines'], message: INVOICE_MESSAGES.totalNegative })
    }
    return issues
}

function dayOf(value: unknown): string {
    return textOf(value).slice(0, 10)
}

function dueDateIssues(values: Record<string, unknown>): Issue[] {
    const date = dayOf(values.date)
    const due = dayOf(values.due_date)
    if (!isIsoDay(date) || !isIsoDay(due) || due >= date) return []
    return [{ path: ['due_date'], message: INVOICE_MESSAGES.dueBeforeDate }]
}

function hasItemLine(lines: readonly TableRow[]): boolean {
    return lines.some(row => row.kind === 'item' && textOf(row.product).trim() !== '')
}

function invoiceIssues(
    values: Record<string, unknown>,
    currency: string,
    mode: InvoiceSaveMode,
    tax: DocumentTax
): Issue[] {
    const lines = linesOf(values.lines)
    const cells = lines.flatMap((row, index) => cellIssues(row, index, currency))
    const issues: Issue[] = [...dueDateIssues(values), ...cells]
    if (lines.length > MAX_DOCUMENT_LINES) {
        issues.push({ path: ['lines'], message: INVOICE_MESSAGES.tooManyLines })
    }
    issues.push(...totalIssues(lines, cells.length === 0, tax))
    if (isTooLong(values.message)) {
        issues.push({ path: ['message'], message: INVOICE_NOTE_TOO_LONG.message })
    }
    if (isTooLong(values.memo)) {
        issues.push({ path: ['memo'], message: INVOICE_NOTE_TOO_LONG.memo })
    }
    if (mode === 'post' && !hasItemLine(lines)) {
        issues.push({ path: ['lines'], message: INVOICE_MESSAGES.needItemLine })
    }
    return issues
}

// Save draft and Post share every rule; Post adds one: at least one Item line with a
// product. `tax` is the header's chosen tax; absent, the totals are checked without it.
export function invoiceSchema(
    currency: string,
    mode: InvoiceSaveMode,
    tax: DocumentTax = null
): ZodTypeAny {
    return z
        .object({})
        .passthrough()
        .superRefine((values, ctx) => {
            for (const issue of invoiceIssues(values, currency, mode, tax)) {
                ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
            }
        })
}
