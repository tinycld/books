// The one client home of Banking's rules and texts. The server's twins (the account
// types, the file extensions, the size limit and the file messages) are in
// server/banking.go; tests/bank-connections.test.ts drift-tests them against that file.
import { z } from '@tinycld/core/ui/form'
import type { BooksAccounts, BooksBankFiles } from '../types'
import { ownBalance } from './account-tree'
import { formatMoney } from './money'
import { formatDay } from './register-range'

export const BANK_ACCOUNT_TYPES = [
    'bank',
    'credit_card',
] as const satisfies readonly BooksAccounts['type'][]

const bankTypes: ReadonlySet<string> = new Set(BANK_ACCOUNT_TYPES)

export function isBankAccount(account: { type: string }): boolean {
    return bankTypes.has(account.type)
}

export const BANK_FILE_EXTENSIONS = ['.csv', '.ofx', '.qfx', '.qbo'] as const

export const MAX_BANK_FILE_BYTES = 5_242_880

export const BANK_NAME_MAX = 100

export const CONNECTION_ERRORS = {
    accountEmpty: 'Choose the account to connect',
    bankNameTooLong: 'A bank name can have at most 100 characters',
    maskInvalid: 'Enter the last 4 digits, or leave this blank',
}

export const BANK_FILE_ERRORS = {
    type: 'Choose a CSV, OFX, QFX or QBO file',
    empty: 'This file is empty',
    tooBig: 'Choose a file of 5 MB or less',
    several: 'Drop one file at a time',
}

export const UPLOAD_TRANSPORT_TEXT =
    'The file could not be uploaded. Check your connection and try again.'

export const CONNECT_EMPTY_TEXT = {
    allConnected: 'Every bank and credit card account is already connected.',
    none: 'Your chart of accounts has no bank or credit card account.',
}

export const connectionSchema = z.object({
    account: z.string().min(1, CONNECTION_ERRORS.accountEmpty),
    // PocketBase counts a text field in runes, so count code points, not UTF-16 units.
    institution: z
        .string()
        .refine(
            value => Array.from(value).length <= BANK_NAME_MAX,
            CONNECTION_ERRORS.bankNameTooLong
        ),
    account_mask: z.string().regex(/^(\d{4})?$/, CONNECTION_ERRORS.maskInvalid),
})

export const bankDetailsSchema = connectionSchema.omit({ account: true })

export type ConnectionFormValues = z.infer<typeof connectionSchema>

export type BankDetailsValues = z.infer<typeof bankDetailsSchema>

function hasBankExtension(name: string): boolean {
    const lower = name.toLowerCase()
    return BANK_FILE_EXTENSIONS.some(ext => lower.endsWith(ext))
}

// Only the first issue is reported, in the order type, empty, too big, so a 0-byte file
// of the wrong type says the type is wrong rather than that it is empty.
function firstFileIssue(file: { name: string; size: number }): string | null {
    if (!hasBankExtension(file.name)) return BANK_FILE_ERRORS.type
    if (file.size === 0) return BANK_FILE_ERRORS.empty
    if (file.size > MAX_BANK_FILE_BYTES) return BANK_FILE_ERRORS.tooBig
    return null
}

export const bankFileSchema = z
    .object({ name: z.string(), size: z.number() })
    .superRefine((file, ctx) => {
        const message = firstFileIssue(file)
        if (message) ctx.addIssue({ code: 'custom', message })
    })

export function bankFileIssue(file: { name: string; size: number }): string | null {
    const result = bankFileSchema.safeParse(file)
    return result.success ? null : (result.error.issues[0]?.message ?? null)
}

export function droppedFilesIssue(count: number): string | null {
    return count > 1 ? BANK_FILE_ERRORS.several : null
}

const FORMAT_LABELS: Record<BooksBankFiles['format'], string> = {
    csv: 'CSV',
    ofx: 'OFX',
}

// The server always stamps a format (a required select), but the row type is only a
// claim about runtime data: a value outside the map gets no label, not "undefined".
export function bankFileFormatLabel(format: BooksBankFiles['format']): string {
    return FORMAT_LABELS[format] ?? ''
}

const STATUS_LABELS: Record<BooksBankFiles['status'], string> = {
    uploaded: 'Waiting to import',
    imported: 'Imported',
    failed: 'Import failed',
}

export function bankFileStatusLabel(status: BooksBankFiles['status']): string {
    return STATUS_LABELS[status] ?? ''
}

const KIB = 1024
const MIB = 1024 * 1024

export function fileSizeText(bytes: number): string {
    if (bytes < MIB) return `${Math.max(1, Math.round(bytes / KIB))} KB`
    return `${(bytes / MIB).toFixed(1)} MB`
}

export function accountMaskText(mask: string): string {
    return mask ? `••${mask}` : ''
}

export function bankDetailsText(row: { institution: string; accountMask: string }): string {
    return [row.institution, accountMaskText(row.accountMask)].filter(Boolean).join(' ')
}

export function connectionLabel(number: string, name: string): string {
    return `${number} ${name}`.trim()
}

export function waitingText(count: number): string {
    if (count === 0) return 'No files waiting'
    if (count === 1) return '1 file waiting'
    return `${count} files waiting`
}

export function cardBalance(
    row: { accountType: string; debitTotal: number; creditTotal: number },
    currency: string
): { text: string; isNegative: boolean } {
    const balance = ownBalance(row.accountType, row.debitTotal, row.creditTotal)
    return { text: formatMoney(balance, currency), isNegative: balance < 0 }
}

// The UTC day of `created`, the same day the server's duplicate message writes.
export function uploadedOnText(created: string, userName: string): string {
    const day = formatDay(created.slice(0, 10))
    return userName ? `${day} by ${userName}` : day
}

export function uploadedText(created: string, userName: string): string {
    return `Uploaded ${uploadedOnText(created, userName)}`
}

const STATUS_ONLY_FAILURE = /^Upload failed \(\d+\)$/

// Core's upload throws an Error with the server's message for a refusal, and
// "Upload failed (<status>)" when the response has none; a network failure is a
// TypeError on web. Only a refusal's own text helps the user, so all else is transport.
export function uploadErrorText(error: unknown): { text: string; isTransport: boolean } {
    const isRefusal =
        error instanceof Error &&
        !(error instanceof TypeError) &&
        !STATUS_ONLY_FAILURE.test(error.message)
    if (isRefusal) return { text: error.message, isTransport: false }
    return { text: UPLOAD_TRANSPORT_TEXT, isTransport: true }
}

type ConnectableAccount = { id: string; type: string; inactive: boolean }

export function isConnectable(
    account: ConnectableAccount,
    connectedAccountIds: ReadonlySet<string>
): boolean {
    return isBankAccount(account) && !account.inactive && !connectedAccountIds.has(account.id)
}

export function connectEmptyReason(
    accounts: readonly ConnectableAccount[],
    connectedAccountIds: ReadonlySet<string>
): 'allConnected' | 'none' | null {
    const active = accounts.filter(account => isBankAccount(account) && !account.inactive)
    if (active.length === 0) return 'none'
    if (active.some(account => isConnectable(account, connectedAccountIds))) return null
    return 'allConnected'
}

const DISCONNECT_KEEPS = 'The account, its balance and its journal entries stay in Books.'

export function disconnectBody(waitingCount: number): string {
    if (waitingCount === 0) return DISCONNECT_KEEPS
    if (waitingCount === 1) return `Its 1 file waiting to import is deleted. ${DISCONNECT_KEEPS}`
    return `Its ${waitingCount} files waiting to import are deleted. ${DISCONNECT_KEEPS}`
}

export function selectedConnectionId(
    rows: readonly { id: string }[],
    param: string | undefined
): string {
    if (param && rows.some(row => row.id === param)) return param
    return rows[0]?.id ?? ''
}

export function isBankFileRow(value: unknown): value is BooksBankFiles {
    return (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        typeof value.id === 'string' &&
        'connection' in value &&
        typeof value.connection === 'string' &&
        'name' in value &&
        typeof value.name === 'string' &&
        'status' in value &&
        typeof value.status === 'string' &&
        'created' in value &&
        typeof value.created === 'string'
    )
}
