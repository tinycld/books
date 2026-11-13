import type { Page, Request, Response } from '@playwright/test'
import { BATCH_WRITE, batchOperations, refuseBatchOperation } from './journal-entries-helpers'

// A save of a sales document is one batch request: a new document's row and its lines,
// or a saved document's line writes and its one header write. Only the post of a NEW
// document, a void and a delete are requests of their own.

type WriteMethod = 'POST' | 'PATCH' | 'DELETE'

// The place of the first operation of a batch that writes `collection` with `method`;
// -1 for a request that is not such a batch.
export function batchWriteIndex(request: Request, collection: string, method: WriteMethod): number {
    return batchOperations(request).findIndex(
        operation =>
            operation.method === method &&
            operation.url.includes(`/api/collections/${collection}/records`)
    )
}

// Waits for the answer, with `status`, of a batch that writes `collection` with `method`.
export function batchAnswered(
    page: Page,
    collection: string,
    method: WriteMethod,
    status: number
): Promise<Response> {
    return page.waitForResponse(
        response =>
            response.status() === status &&
            batchWriteIndex(response.request(), collection, method) >= 0
    )
}

// Refuses that operation of every such batch with `response`, as PocketBase answers a
// batch whose operation is refused; every other request passes. It covers the client
// only: the Go tests cover the server's own refusals.
export async function refuseBatchWrite(
    page: Page,
    collection: string,
    method: WriteMethod,
    response: object
) {
    await page.route(BATCH_WRITE, route => {
        const index = batchWriteIndex(route.request(), collection, method)
        if (index < 0) return route.continue()
        return refuseBatchOperation(route, index, { status: 400, ...response })
    })
}
