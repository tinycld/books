import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { z } from 'zod'
import { DOCUMENT_SEND_PATH, SEND_KINDS, type SendKind } from '../lib/document-send'
import { errorStatus } from '../lib/refusal'
import { postBooksRoute } from '../lib/statement-requests'
import type { BooksDocumentSends } from '../types'

// One document of a send request (spec §4.4). A single send carries the dialog's subject
// and message (the editor's HTML); a batch item carries neither, and the server fills both.
export type DocumentSendItem = {
    kind: SendKind
    id: string
    to: string
    cc: string[]
    subject?: string
    body?: string
}

export type DocumentSendAnswer = {
    sent: BooksDocumentSends[]
    failed: { kind: SendKind; id: string; message: string }[]
}

// The send route's network call: resolves to the answer's JSON as the server wrote it, so
// the hook's own parse runs on it (a test's fake gives its JSON the same way).
export type DocumentSendRequest = (items: DocumentSendItem[]) => Promise<unknown>

// A saved `books_document_sends` row as the route answers it (PocketBase's record JSON):
// every field of the row; the record's own keys (collectionId, …) are kept.
const sentRowSchema = z.looseObject({
    id: z.string().min(1),
    doc_type: z.enum(SEND_KINDS),
    document: z.string(),
    number: z.string(),
    customer: z.string(),
    vendor: z.string(),
    to: z.string(),
    cc: z.string(),
    subject: z.string(),
    body: z.string(),
    body_text: z.string(),
    sent_by: z.string(),
    created: z.string(),
})

const sendAnswerSchema = z.object({
    sent: z.array(sentRowSchema),
    failed: z.array(z.object({ kind: z.enum(SEND_KINDS), id: z.string(), message: z.string() })),
})

// The text of a failed send whose answer is not the route's shape. The server may have
// sent some emails: their rows reach the sent line and the history through realtime.
export const DOCUMENT_SEND_ANSWER_UNREADABLE =
    "The server's answer to the send could not be read. Check the document's sent line before you send again."

async function requestDocumentSend(items: DocumentSendItem[]): Promise<unknown> {
    const response = await postBooksRoute(DOCUMENT_SEND_PATH, { documents: items })
    return response.json().catch(() => null)
}

// Each caller shows a failed request (the Send dialog's summary, the batch dialog's
// refusal), so it is only logged here: a refusal (4xx) at info, anything else as an error.
function logSendFailure(error: unknown) {
    const status = errorStatus(error)
    if (status !== undefined && status >= 400 && status < 500) {
        log.info('books.documents.send', 'send refused', { status })
        return
    }
    log.error('books.documents.send', error)
}

/**
 * Sends sales documents by email (spec §4.5): a core `useMutation` whose function posts
 * `{ documents }` to the send route, parses the answer with zod, then files the sent rows
 * with `collection.accept`, so the sent line shows before the realtime echo. It resolves to
 * the answer: the outcome of each document is read from its `sent` and `failed`, never from
 * the store. A failure to file is logged, not thrown: the server sent the email and saved
 * the row, and the echo still delivers it. An answer of another shape rejects with
 * DOCUMENT_SEND_ANSWER_UNREADABLE; a refused request rejects with the server's message.
 * `request` replaces the network call (a test's fake).
 */
export function useDocumentSend(options: { request?: DocumentSendRequest } = {}) {
    const [sends] = useStore('books_document_sends')
    const request = options.request ?? requestDocumentSend
    return useMutation({
        mutationKey: ['books', 'documents', 'send'],
        // Offline is a failure to show now, not a request to hold.
        networkMode: 'always',
        mutationFn: async (items: DocumentSendItem[]): Promise<DocumentSendAnswer> => {
            const parsed = sendAnswerSchema.safeParse(await request(items))
            if (!parsed.success) throw new Error(DOCUMENT_SEND_ANSWER_UNREADABLE)
            const answer = parsed.data
            if (answer.sent.length > 0) {
                try {
                    await sends.accept(answer.sent)
                } catch (error) {
                    log.error('books.documents.send.accept', error)
                }
            }
            return answer
        },
        onError: logSendFailure,
    })
}
