import { z } from 'zod'
import { isOneBareAddress } from './bare-address'
import type { DocumentListRow } from './document-list'
import { formatDay } from './register-range'
import { isSendDocType, KIND_WORDS, SEND_DOC_TYPES } from './send-doc-types'
import { readerDayOf } from './statement-texts'

// The send of a sales document by email (spec §3.1, §3.2, §4.4). The rules here are the
// ones the Go route runs (server/document_send.go); one case table pins both
// (server/testdata/document_send_cases.json). PocketBase adds a final period to the
// server's text; the texts here are written with theirs.

export const SEND_KINDS = SEND_DOC_TYPES
export type SendKind = (typeof SEND_KINDS)[number]

export const DOCUMENT_SEND_PATH = '/api/books/documents/send'

// How long the toast of a sent document (SendDocumentForm) or a sent batch (useBatchSend)
// shows.
export const SENT_TOAST_MS = 4000

// The route's bounds (server/document_send.go maxDocumentsPerRequest, the subject and
// message rules) and the row's `to` field (migration 2100000034, max 320).
export const MAX_SEND_DOCUMENTS = 200
export const MAX_SEND_CC = 5
export const MAX_SEND_SUBJECT = 300
export const MAX_SEND_BODY = 20_000
const MAX_ADDRESS_LENGTH = 320

export const SEND_MESSAGES = {
    toRequired: 'Enter an email address.',
    toInvalid: 'Enter a valid email address.',
    ccInvalid: 'Enter valid email addresses, separated by commas.',
    ccTooMany: 'Use 5 addresses or fewer.',
    subjectRequired: 'Enter a subject.',
    subjectTooLong: 'Use 300 characters or fewer.',
    bodyRequired: 'Enter a message.',
    bodyTooLong: 'The message is too long. Shorten it and send again.',
} as const

// A posting kind is sent once posted; an estimate while it is open or decided. A draft,
// a void document and a closed estimate are not (Go sendableStatus).
const ESTIMATE_SEND_STATUSES: readonly string[] = ['pending', 'accepted', 'rejected']

export function sendOffered(kind: string, status: string): boolean {
    if (!isSendDocType(kind)) return false
    if (kind === 'estimate') return ESTIMATE_SEND_STATUSES.includes(status)
    return status === 'posted'
}

// One bare address (Go isOneBareAddress, lib/bare-address.ts) that fits the row's `to`
// field, whose max PocketBase counts in characters (code points).
function isSendAddress(address: string): boolean {
    return isOneBareAddress(address) && characterCount(address) <= MAX_ADDRESS_LENGTH
}

// The Cc field's addresses: split at each comma, each one without its outer spaces.
export function parseCc(text: string): string[] {
    return text
        .split(',')
        .map(part => part.trim())
        .filter(part => part !== '')
}

// The server turns each line break of a subject into a space before it counts (Go
// oneLine) and counts it in UTF-16 units, as JavaScript `.length` does (Go utf16Length).
function subjectLine(subject: string): string {
    return subject.replace(/\r\n|\r|\n/g, ' ')
}

function characterCount(text: string): number {
    return [...text].length
}

export type DocumentSendValues = {
    to: string
    cc: string
    subject: string
    body: string
    bodyText: string
}

const valuesShape = z.object({
    to: z.string(),
    cc: z.string(),
    subject: z.string(),
    body: z.string(),
    bodyText: z.string(),
})

// The Send dialog's fields (spec §3.2). `body` is the editor's HTML and `bodyText` its
// text; the dialog writes both with setValue before it submits. Each field gets at most
// one issue, and the Message's issue is filed under `body`.
function checkValues(values: DocumentSendValues, ctx: z.RefinementCtx) {
    const issue = (path: keyof DocumentSendValues, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message })
    const to = values.to.trim()
    if (to === '') issue('to', SEND_MESSAGES.toRequired)
    else if (!isSendAddress(to)) issue('to', SEND_MESSAGES.toInvalid)
    const cc = parseCc(values.cc)
    if (!cc.every(isSendAddress)) issue('cc', SEND_MESSAGES.ccInvalid)
    else if (cc.length > MAX_SEND_CC) issue('cc', SEND_MESSAGES.ccTooMany)
    const subject = subjectLine(values.subject).trim()
    if (subject === '') issue('subject', SEND_MESSAGES.subjectRequired)
    else if (subject.length > MAX_SEND_SUBJECT) {
        issue('subject', SEND_MESSAGES.subjectTooLong)
    }
    if (values.bodyText.trim() === '') issue('body', SEND_MESSAGES.bodyRequired)
    else if (values.body.length > MAX_SEND_BODY) {
        issue('body', SEND_MESSAGES.bodyTooLong)
    }
}

export const documentSendSchema: z.ZodType<DocumentSendValues, DocumentSendValues> =
    valuesShape.superRefine(checkValues)

// The sent line under a document's status (spec §3.6): the latest send's day in the
// reader's zone and its address, then the count after more than one send. Cc is not named.
export function documentSentLine(latest: { created: string; to: string }, count: number): string {
    const day = readerDayOf(latest.created)
    // `created` is an autodate, so a row always has one; a bad value drops only the day.
    const line = day === '' ? `Sent to ${latest.to}` : `Sent ${formatDay(day)} to ${latest.to}`
    return count > 1 ? `${line} · sent ${count} times` : line
}

// The toast of a single send (spec §3.2 "On success"): "Invoice 1004 sent to <address>".
export function sentToast(noun: string, number: string, to: string): string {
    return `${noun} ${number} sent to ${to}`
}

// A list row as the batch send reads it (lib/document-list.ts DocumentListRow): its kind,
// its stored status and the document's own address ('' for none, plan decision 7).
type BatchRow = Pick<DocumentListRow, 'kind' | 'recordStatus' | 'email'>

// The Batch actions menu offers Send for a writer when at least one ticked row is
// sent-able by kind and status (spec §3.3 "Batch"), also when that row has no address:
// the dialog then names it as skipped.
export function batchSendOffered(rows: readonly BatchRow[], canWrite: boolean): boolean {
    return canWrite && rows.some(row => sendOffered(row.kind, row.recordStatus))
}

// A ticked row the batch sends: sent-able, with an address.
export function isBatchSendable(row: BatchRow): boolean {
    return sendOffered(row.kind, row.recordStatus) && row.email !== ''
}

export type BatchSendCounts = { sendable: number; noAddress: number; notSendable: number }

// The ticked rows as the batch dialog counts them: sendable (sent-able, with an address),
// no email address (sent-able, with none) and not sendable (a draft, a void document, a
// closed estimate, a kind that is never sent), with or without an address.
export function batchSendCounts(rows: readonly BatchRow[]): BatchSendCounts {
    const counts = { sendable: 0, noAddress: 0, notSendable: 0 }
    for (const row of rows) {
        if (!sendOffered(row.kind, row.recordStatus)) counts.notSendable += 1
        else if (row.email === '') counts.noAddress += 1
        else counts.sendable += 1
    }
    return counts
}

export type BatchSendCopy = {
    title: string
    body: string
    // null when no ticked row is skipped.
    skipped: string | null
    // null when the dialog has no refusal.
    refusal: string | null
    // null when the dialog has only Close (email is not set up).
    confirmLabel: string | null
    isConfirmEnabled: boolean
}

const BATCH_SEND_BODY = 'Each goes to the email address on the document.'
const BATCH_NOT_SET_UP = 'Email sending is not set up.'
// The route's text (server/document_send.go msgDocumentTooMany).
const BATCH_TOO_MANY = `Select at most ${MAX_SEND_DOCUMENTS} documents.`

function documentsWord(count: number): string {
    return count === 1 ? 'document' : 'documents'
}

// "3 are skipped: 2 have no email address, 1 is a draft or void."; null for none.
function skippedLine(counts: BatchSendCounts): string | null {
    const { noAddress, notSendable } = counts
    const total = noAddress + notSendable
    if (total === 0) return null
    const parts: string[] = []
    if (noAddress > 0) {
        parts.push(`${noAddress} ${noAddress === 1 ? 'has' : 'have'} no email address`)
    }
    if (notSendable > 0) {
        parts.push(
            notSendable === 1
                ? `${notSendable} is a draft or void`
                : `${notSendable} are drafts or void`
        )
    }
    return `${total} ${total === 1 ? 'is' : 'are'} skipped: ${parts.join(', ')}.`
}

// The batch dialog's texts (spec §3.3 "Batch", plan decision 6): the title counts every
// ticked row; the confirm counts the sendable ones and is disabled with none or with more
// than MAX_SEND_DOCUMENTS (the refusal then says so). With email not set up the dialog
// reads only that, and has only Close.
export function batchSendCopy(counts: BatchSendCounts, canSendEmail: boolean): BatchSendCopy {
    const ticked = counts.sendable + counts.noAddress + counts.notSendable
    const title = `Send ${ticked} ${documentsWord(ticked)}?`
    if (!canSendEmail) {
        return {
            title,
            body: BATCH_NOT_SET_UP,
            skipped: null,
            refusal: null,
            confirmLabel: null,
            isConfirmEnabled: false,
        }
    }
    const isTooMany = counts.sendable > MAX_SEND_DOCUMENTS
    return {
        title,
        body: BATCH_SEND_BODY,
        skipped: skippedLine(counts),
        refusal: isTooMany ? BATCH_TOO_MANY : null,
        confirmLabel: `Send ${counts.sendable}`,
        isConfirmEnabled: counts.sendable > 0 && !isTooMany,
    }
}

// The toast after a batch whose every document was sent: "9 documents sent".
export function batchSentToast(count: number): string {
    return `${count} ${documentsWord(count)} sent`
}

// The banner after a part failure (spec §3.3 "Result"): "6 of 9 documents were sent.", then
// "<Kind word> <number>: <the server's message>" for each failed document, its number read
// from the ticked rows by id (the kind word alone when the row is no longer listed).
export function batchResultLines(result: {
    sent: number
    failed: readonly { kind: SendKind; id: string; message: string }[]
    rows: readonly Pick<DocumentListRow, 'id' | 'number'>[]
}): { summary: string; lines: string[] } {
    const total = result.sent + result.failed.length
    const verb = total === 1 ? 'was' : 'were'
    const summary = `${result.sent} of ${total} ${documentsWord(total)} ${verb} sent.`
    const lines = result.failed.map(item => {
        const number = result.rows.find(row => row.id === item.id)?.number ?? ''
        const word = KIND_WORDS[item.kind].title
        const name = number === '' ? word : `${word} ${number}`
        return `${name}: ${item.message}`
    })
    return { summary, lines }
}

export type SendDialogStatus = 'loading' | 'failed' | 'ready' | 'not-set-up'

// The Send dialog's state (spec §3.2 "Load", plan decision 21) from the flags of its live
// reads and useEmailStatus(): a failed read wins over a pending one; once every read has
// landed, an email status that is loading or failed (canSend false) is "not set up".
export function sendDialogStatus(input: {
    reads: readonly { isLoading: boolean; isError: boolean }[]
    email: { canSend: boolean; isLoading: boolean }
}): SendDialogStatus {
    if (input.reads.some(read => read.isError)) return 'failed'
    if (input.reads.some(read => read.isLoading)) return 'loading'
    return input.email.canSend ? 'ready' : 'not-set-up'
}
