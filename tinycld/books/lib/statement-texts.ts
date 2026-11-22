// The words of customer statements (statements spec §3). A plain module: no React, no
// React Native, so the seed, the audit labels and e2e helpers can import it.
import type { StatementRunFailure, StatementRunOutcome } from '../stores/statements-store'
import type { BooksStatements } from '../types'
import { formatDay } from './register-range'

export type StatementType = BooksStatements['type']

// The create screen's Customer balance filter (spec §3.2).
export type StatementBalanceFilter = 'open' | 'overdue' | 'all'

export const STATEMENT_TYPE_LABELS: Record<StatementType, string> = {
    balance_forward: 'Balance forward',
    open_items: 'Open items',
}

export const STATEMENT_BALANCE_LABELS: Record<StatementBalanceFilter, string> = {
    open: 'Open',
    overdue: 'Overdue',
    all: 'All',
}

// The toast of a Save run that stored every statement (spec §3.4).
export function savedToast(count: number): string {
    return count === 1 ? '1 statement saved' : `${count} statements saved`
}

const EMPTY_TITLES: Record<StatementBalanceFilter, string> = {
    open: 'No customer has an open balance',
    overdue: 'No customer is overdue',
    all: 'No customers yet',
}

// The create screen's list when no customer matches Customer balance (spec §3.10).
export function emptyRecipientsText(filter: StatementBalanceFilter): {
    title: string
    detail: string
} {
    return {
        title: EMPTY_TITLES[filter],
        detail: 'Change Customer balance to list more customers.',
    }
}

// The toast of a Save and send run that sent every statement (spec §3.4).
export function sentToast(count: number): string {
    return count === 1 ? '1 statement sent' : `${count} statements sent`
}

// The first line of the run notice after a part of a run failed (spec §3.4). It reads the
// counts only, so a failure need not carry its saved statement.
export function runNoticeText(
    outcome: Omit<StatementRunOutcome, 'failed'> & { failed: readonly StatementRunFailure[] }
): string {
    const verb = outcome.intent === 'send' ? 'sent' : 'saved'
    return `${outcome.done} of ${outcome.total} statements were ${verb}.`
}

// The danger line under the address of a row whose saved statement was not sent (spec §3.4).
export function savedNotSentText(number: string, message: string): string {
    return `${number} not sent: ${message}`
}

// The line under the bar when the server cannot send email (spec §3.4).
export const EMAIL_NOT_SET_UP = 'Email sending is not set up'

export type StatementBarInput = {
    canWrite: boolean
    writesAvailable: boolean
    tickedCount: number
    isLoading: boolean
    hasLoadError: boolean
    // A run is in flight (stores/statements-store.ts); `intent` names the button that
    // started it.
    isHeld: boolean
    intent: 'save' | 'send'
    // core fetchEmailStatus() (hooks/useEmailStatus.ts): whether the server can send email,
    // and whether that answer is still loading.
    canSend: boolean
    emailStatusLoading: boolean
    // Preview's PDF is being prepared (hooks/useStatementPreview.ts).
    isPreparing: boolean
}

export type StatementBarAction = { isDisabled: boolean; label: string }

// Each button of the create screen's bar (spec §3.4, §3.10): a run needs a writer, writes
// available, a loaded list and at least one tick, and no run in flight. Preview is also
// idle while its PDF is prepared; Save and send also needs the server to send email, and is
// idle while that is not known yet. Cancel leaves at any time but while a run is in
// flight. The note under the bar says when the server cannot send email.
export function statementBarState(input: StatementBarInput): {
    cancel: StatementBarAction
    preview: StatementBarAction
    save: StatementBarAction
    send: StatementBarAction
    note: string | null
} {
    const isRunDisabled =
        !input.canWrite ||
        !input.writesAvailable ||
        input.tickedCount === 0 ||
        input.isLoading ||
        input.hasLoadError ||
        input.isHeld
    const isSaving = input.isHeld && input.intent === 'save'
    const isSending = input.isHeld && input.intent === 'send'
    const isEmailBlocked = input.emailStatusLoading || !input.canSend
    const isEmailNotSetUp = !input.emailStatusLoading && !input.canSend
    return {
        cancel: { isDisabled: input.isHeld, label: 'Cancel' },
        preview: {
            isDisabled: isRunDisabled || input.isPreparing,
            label: input.isPreparing ? 'Preparing…' : 'Preview',
        },
        save: { isDisabled: isRunDisabled, label: isSaving ? 'Saving…' : 'Save' },
        send: {
            isDisabled: isRunDisabled || isEmailBlocked,
            label: isSending ? 'Sending…' : 'Save and send',
        },
        note: isEmailNotSetUp ? EMAIL_NOT_SET_UP : null,
    }
}

// A read-only user, or one whose access has not loaded yet, gets the Books no-write notice
// in place of the form (spec §3.9).
export function createScreenMode(input: {
    canWrite: boolean
    accessLoading: boolean
}): 'notice' | 'form' {
    return input.canWrite && !input.accessLoading ? 'form' : 'notice'
}

// The Period of a statement (spec §3.7): "Sep 21 – Oct 22, 2026" for Balance forward, the
// first year left out when both days are in one year; "As of Oct 22, 2026" for Open items.
export function statementPeriodText(
    row: Pick<BooksStatements, 'type' | 'statement_date' | 'start_date' | 'end_date'>
): string {
    if (row.type === 'open_items') return `As of ${formatDay(row.statement_date)}`
    const start = formatDay(row.start_date)
    const isSameYear = row.start_date.slice(0, 4) === row.end_date.slice(0, 4)
    const shownStart = isSameYear ? start.replace(/, \d+$/, '') : start
    return `${shownStart} – ${formatDay(row.end_date)}`
}

// A PocketBase datetime ('YYYY-MM-DD HH:mm:ss.SSSZ', UTC) as the reader's local day, or ''
// when it is no datetime. lib/opening-balances.ts has the same rule as `localDayOf`, but
// that module reaches the core logger, and this one stays plain for the e2e helpers. The
// sent line of a document (lib/document-send.ts documentSentLine) reads it too.
export function readerDayOf(moment: string): string {
    const parsed = new Date(moment.replace(' ', 'T'))
    if (Number.isNaN(parsed.getTime())) return ''
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`
}

// The Sent line (spec §3.7): the day of `sent_at` in the reader's zone and the address, or
// "Not sent".
export function statementSentText(row: Pick<BooksStatements, 'sent_at' | 'sent_to'>): string {
    const day = row.sent_at === '' ? '' : readerDayOf(row.sent_at)
    if (day === '') return 'Not sent'
    return `${formatDay(day)} to ${row.sent_to}`
}

// The statement screen's PDF page when its PDF does not load (spec §3.8).
export const STATEMENT_PDF_ERROR = 'Could not load the statement'

// The statement screen's title (spec §3.8).
export function statementTitle(number: string): string {
    return `Statement ${number}`
}

// The Go fileStem's limit (server/pdf_statement.go maxFileStemRunes).
const MAX_FILE_STEM_RUNES = 80

// The rule of the Go fileStem (server/pdf_statement.go), pinned for both by
// server/testdata/file_stem_cases.json: lower case; a letter, mark or digit is kept; a run of
// spaces or "-" between two kept characters becomes one "-"; anything else is dropped; the
// result is cut at 80 code points and trimmed of "-".
export function fileStem(text: string): string {
    let stem = ''
    let isDash = false
    for (const char of text.toLowerCase()) {
        if (/^[\p{White_Space}-]$/u.test(char)) {
            isDash = true
        } else if (/^[\p{L}\p{M}\p{Nd}]$/u.test(char)) {
            if (isDash && stem !== '') stem += '-'
            isDash = false
            stem += char
        }
    }
    const cut = Array.from(stem).slice(0, MAX_FILE_STEM_RUNES).join('')
    return cut.replace(/^-+|-+$/g, '')
}

// The file name of a statement's PDF (spec §3.5), as the Go statementFileName gives it: a
// part with no letter or digit adds nothing.
export function statementAttachmentName(number: string, customerName: string): string {
    const parts = ['statement', fileStem(number), fileStem(customerName)].filter(
        part => part !== ''
    )
    return `${parts.join('-')}.pdf`
}

export type StatementRowAction = 'open' | 'send' | 'download' | 'delete'
export type StatementScreenAction = Exclude<StatementRowAction, 'open'>

// The actions of a statement (spec §3.7, §3.8, §3.9). A reader gets Open and Download PDF.
// A writer gets Send… and Delete too; with email not set up the row menu leaves Send… out
// (RecordRowMenu has no disabled item), and the statement screen shows Send… disabled with
// the note. While the email status loads (hooks/useEmailStatus.ts) Send… is treated the
// same way but with no note, as the create screen's statementBarState does.
export function statementActions(input: {
    canWrite: boolean
    canSend: boolean
    emailStatusLoading: boolean
}): {
    rowMenu: StatementRowAction[]
    screen: StatementScreenAction[]
    isSendDisabled: boolean
    note: string | null
} {
    if (!input.canWrite) {
        return {
            rowMenu: ['open', 'download'],
            screen: ['download'],
            isSendDisabled: true,
            note: null,
        }
    }
    const isSendReady = input.canSend && !input.emailStatusLoading
    const isEmailNotSetUp = !input.emailStatusLoading && !input.canSend
    const rowMenu: StatementRowAction[] = isSendReady
        ? ['open', 'send', 'download', 'delete']
        : ['open', 'download', 'delete']
    return {
        rowMenu,
        screen: ['send', 'download', 'delete'],
        isSendDisabled: !isSendReady,
        note: isEmailNotSetUp ? EMAIL_NOT_SET_UP : null,
    }
}

// The labels of a statement's row menu (spec §3.7).
export const STATEMENT_ROW_ACTION_LABELS: Record<StatementRowAction, string> = {
    open: 'Open',
    send: 'Send…',
    download: 'Download PDF',
    delete: 'Delete',
}

// The Delete confirm of a statement (spec §3.8).
export function statementDeleteTitle(number: string): string {
    return `Delete statement ${number}?`
}
export const STATEMENT_DELETE_MESSAGE = "The customer's balance does not change."

// The statement screen for a statement that does not exist or that the user cannot read
// (spec §3.8).
export const STATEMENT_NOT_FOUND = 'This statement does not exist, or you cannot open it.'

// The toast of a send from the Send statement dialog (spec §3.8).
export function statementSentToast(to: string): string {
    return `Statement sent to ${to}`
}

// The muted line of the statement screen when the amount due of the PDF (the ledger as it
// is now) differs from the stored one (spec §3.8); `amount` is the stored one, formatted.
export function statementAmountChangedText(amount: string): string {
    return `The amount due was ${amount} when this statement was made.`
}

// The statement screen's sent line (spec §3.8): "Sent Nov 20, 2026 to …", or "Not sent".
export function statementSentLine(row: Pick<BooksStatements, 'sent_at' | 'sent_to'>): string {
    const text = statementSentText(row)
    return text === 'Not sent' ? text : `Sent ${text}`
}
