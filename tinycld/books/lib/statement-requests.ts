import { pb } from '@tinycld/core/lib/pocketbase'
import { serverFetch } from '@tinycld/core/lib/server-fetch'
import { authHeaders } from './auth-headers'
import { pdfRefusalMessage } from './pdf-download'

// The two statement routes of the create screen (server/statement_routes.go): Preview's
// PDF and the send. They take the bearer token as every Books document route does.
export const STATEMENT_PREVIEW_PATH = '/api/books/statements/preview'
export const STATEMENT_SEND_PATH = '/api/books/statements/send'

// A refusal of a statement route, shaped as PocketBase's own (`status`, `response.message`),
// so lib/refusal.ts reads its message.
export class StatementRouteError extends Error {
    readonly status: number
    readonly response: { message: string; data: Record<string, never> }

    constructor(status: number, body: unknown) {
        const message = pdfRefusalMessage(status, body)
        super(message)
        this.name = 'StatementRouteError'
        this.status = status
        this.response = { message, data: {} }
    }
}

/**
 * Posts `body` as JSON to a statement route. A refusal throws a StatementRouteError with
 * the server's message; a fetch that never reached the server throws core's
 * ServerUnreachableError.
 */
export async function postStatementRoute(path: string, body: unknown): Promise<Response> {
    const response = await serverFetch(pb.buildURL(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
    })
    if (!response.ok) {
        const answer: unknown = await response.json().catch(() => null)
        throw new StatementRouteError(response.status, answer)
    }
    return response
}
