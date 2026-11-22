import { z } from 'zod'
import { isOneBareAddress } from './bare-address'
import { formatDay } from './register-range'
import { isSendDocType, SEND_DOC_TYPES } from './send-doc-types'
import { readerDayOf } from './statement-texts'

// The send of a sales document by email (spec §3.1, §3.2, §4.4). The rules here are the
// ones the Go route runs (server/document_send.go); one case table pins both
// (server/testdata/document_send_cases.json). PocketBase adds a final period to the
// server's text; the texts here are written with theirs.

export const SEND_KINDS = SEND_DOC_TYPES
export type SendKind = (typeof SEND_KINDS)[number]

export const DOCUMENT_SEND_PATH = '/api/books/documents/send'

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
