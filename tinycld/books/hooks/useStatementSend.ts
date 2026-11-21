import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { z } from 'zod'
import { errorStatus } from '../lib/refusal'
import { postStatementRoute, STATEMENT_SEND_PATH } from '../lib/statement-requests'
import type { BooksStatements } from '../types'

export type StatementSendItem = { id: string; to: string }

export type StatementSendAnswer = {
    sent: BooksStatements[]
    failed: { id: string; message: string }[]
}

export type StatementSendRequest = (items: StatementSendItem[]) => Promise<StatementSendAnswer>

// A saved `books_statements` row as the send route answers it (PocketBase's record JSON):
// every field of the row; the record's own keys (collectionId, …) are kept.
const sentRowSchema = z.looseObject({
    id: z.string().min(1),
    customer: z.string(),
    number: z.string(),
    sequence: z.number(),
    type: z.enum(['balance_forward', 'open_items']),
    statement_date: z.string(),
    start_date: z.string(),
    end_date: z.string(),
    email: z.string(),
    balance: z.number(),
    currency: z.string(),
    sent_at: z.string(),
    sent_to: z.string(),
    created: z.string(),
    updated: z.string(),
})

const sendAnswerSchema = z.object({
    sent: z.array(sentRowSchema),
    failed: z.array(z.object({ id: z.string(), message: z.string() })),
})

// The text of a failed send request whose answer is not the route's shape. The server may
// have sent some emails: their rows reach the list through realtime.
export const SEND_ANSWER_UNREADABLE =
    "The server's answer to the send could not be read. Check the Statements tab before you send again."

// The send route's network call (statements spec §4.4): one request for every item. The
// answer lists each statement as sent (its saved row) or failed (the server's message). An
// answer of another shape fails the request with SEND_ANSWER_UNREADABLE.
export async function requestStatementSend(
    items: StatementSendItem[]
): Promise<StatementSendAnswer> {
    const response = await postStatementRoute(STATEMENT_SEND_PATH, { statements: items })
    const body: unknown = await response.json().catch(() => null)
    const answer = sendAnswerSchema.safeParse(body)
    if (!answer.success) throw new Error(SEND_ANSWER_UNREADABLE)
    return answer.data
}

// The run notice (useCreateStatements.sendStored) shows a failed send request, so the
// failure is only logged here: a refusal (4xx) at info, anything else as an error.
function logSendFailure(error: unknown) {
    const status = errorStatus(error)
    if (status !== undefined && status >= 400 && status < 500) {
        log.info('books.statements.send', 'send refused', { status })
        return
    }
    log.error('books.statements.send', error)
}

/**
 * Sends saved statements by email (statements spec §3.4, §3.8, §4.5): a core `useMutation`
 * whose function posts `{ statements }` to the send route, then files the sent rows with
 * `collection.accept`, so the sent line shows before the realtime echo. A failure to file
 * is logged, not thrown: the server sent the email and saved the row, and the echo still
 * delivers it. A failed request rejects `send` and is only logged (logSendFailure): the
 * caller shows it in the run notice, so it gets no generic error toast. `request` replaces
 * the network call (a test's fake).
 */
export function useStatementSend(options: { request?: StatementSendRequest } = {}) {
    const [statements] = useStore('books_statements')
    const request = options.request ?? requestStatementSend
    const mutation = useMutation({
        mutationKey: ['books', 'statements', 'send'],
        // Offline is a failure to show now, not a request to hold.
        networkMode: 'always',
        mutationFn: async (items: StatementSendItem[]) => {
            const answer = await request(items)
            if (answer.sent.length > 0) {
                try {
                    await statements.accept(answer.sent)
                } catch (error) {
                    log.error('books.statements.send.accept', error)
                }
            }
            return answer
        },
        onError: logSendFailure,
    })
    return { send: mutation.mutateAsync, isSending: mutation.isPending }
}
