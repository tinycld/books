// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type DocumentSendItem, useDocumentSend } from '../tinycld/books/hooks/useDocumentSend'
import { DOCUMENT_SEND_PATH } from '../tinycld/books/lib/document-send'
import type { BooksDocumentSends } from '../tinycld/books/types'
import { arriveFromServer, guardedStore, messageRefusal, seedBooks } from './accounts-form-harness'
import { silenceLog } from './silence-log'

// `pb` is the PocketBase client the default request reads its URL and bearer token from
// (lib/statement-requests.ts `postBooksRoute`, lib/auth-headers.ts).
vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return {
        useStore: useStoreStub,
        pb: {
            buildURL: (path: string) => `https://books.test${path}`,
            authStore: { token: 'token-u1' },
        },
    }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// The send of a sales document (spec §4.5, plan checkpoint 3): the real hook over the
// harness's local-only collections. The `request` option replaces the network call of the
// send route only: it gets the items of `{ documents }` and resolves to the answer's JSON
// as the server wrote it, so the hook's own parse of the answer runs. The outcome comes
// from the answer, never from the store.

silenceLog()

const INVOICE_ID = 'inv000000000001'
const OTHER_ID = 'inv000000000002'
const CUSTOMER = 'cus000000000001'
const TO = 'billing@cedarhollow.example'
const REFUSED =
    'The email server refused nobody@cedarhollow.example. Correct the address and send again.'
const NOT_SET_UP = 'Email sending is not set up.'

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return createElement(QueryClientProvider, { client }, children)
}

// A saved `books_document_sends` row as the route answers it (PocketBase's record JSON).
function sendRow(id: string, document: string): BooksDocumentSends & Record<string, unknown> {
    return {
        collectionId: 'pbc_document_sends',
        collectionName: 'books_document_sends',
        id,
        doc_type: 'invoice',
        document,
        number: '1004',
        customer: CUSTOMER,
        to: TO,
        cc: '',
        subject: 'Invoice 1004 from Hartwell Supply Co.',
        body: '<p>Thank you</p>',
        body_text: 'Thank you',
        sent_by: 'u1',
        created: '2026-11-20 15:04:05.000Z',
    }
}

// The sends store with pbtsdb's `accept` (core lib/server-rows): the rows a custom endpoint
// returns land as server state, through no write handler.
function acceptingSends() {
    const collection = guardedStore<BooksDocumentSends>('books_document_sends', [])
    const accept = async (rows: readonly BooksDocumentSends[]) => {
        await arriveFromServer(() => {
            for (const row of rows) collection.insert(row)
        })
    }
    return Object.assign(collection, { accept })
}

let sends: ReturnType<typeof acceptingSends>

beforeEach(() => {
    seedBooks()
    sends = acceptingSends()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

const SINGLE: DocumentSendItem = {
    kind: 'invoice',
    id: INVOICE_ID,
    to: TO,
    cc: ['ap@cedarhollow.example'],
    subject: 'Invoice 1004 from Hartwell Supply Co.',
    body: '<p><strong>Thank you</strong></p>',
}

function storedIds() {
    return [...sends.toArray].map(row => row.id).sort()
}

describe('useDocumentSend', () => {
    it('files the sent row in books_document_sends and resolves to the answer', async () => {
        const answer = { sent: [sendRow('snd000000000001', INVOICE_ID)], failed: [] }
        const request = vi.fn(async (_items: DocumentSendItem[]): Promise<unknown> => answer)
        const { result } = renderHook(() => useDocumentSend({ request }), { wrapper })

        let sent: unknown
        await act(async () => {
            sent = await result.current.mutateAsync([SINGLE])
        })

        expect(sent).toEqual(answer)
        expect(storedIds()).toEqual(['snd000000000001'])
        expect(sends.get('snd000000000001')?.to).toBe(TO)
    })

    it('gives back a failed item and files only the sent rows', async () => {
        const answer = {
            sent: [sendRow('snd000000000002', INVOICE_ID)],
            failed: [{ kind: 'invoice', id: OTHER_ID, message: REFUSED }],
        }
        const request = vi.fn(async (_items: DocumentSendItem[]): Promise<unknown> => answer)
        const { result } = renderHook(() => useDocumentSend({ request }), { wrapper })

        let sent: unknown
        await act(async () => {
            sent = await result.current.mutateAsync([
                { kind: 'invoice', id: INVOICE_ID, to: TO, cc: [] },
                { kind: 'invoice', id: OTHER_ID, to: 'nobody@cedarhollow.example', cc: [] },
            ])
        })

        expect(sent).toEqual(answer)
        expect(storedIds()).toEqual(['snd000000000002'])
    })

    it("a single send's request holds the subject and the body; a batch's items hold neither", async () => {
        const request = vi.fn(
            async (_items: DocumentSendItem[]): Promise<unknown> => ({ sent: [], failed: [] })
        )
        const { result } = renderHook(() => useDocumentSend({ request }), { wrapper })

        await act(async () => {
            await result.current.mutateAsync([SINGLE])
        })
        expect(request).toHaveBeenCalledTimes(1)
        expect(request.mock.calls[0]?.[0]).toEqual([SINGLE])

        await act(async () => {
            await result.current.mutateAsync([
                { kind: 'invoice', id: INVOICE_ID, to: TO, cc: [] },
                { kind: 'sales_receipt', id: OTHER_ID, to: TO, cc: [] },
            ])
        })
        const batch = request.mock.calls[1]?.[0] ?? []
        expect(batch.map(item => item.id)).toEqual([INVOICE_ID, OTHER_ID])
        for (const item of batch) {
            expect(item.subject).toBeUndefined()
            expect(item.body).toBeUndefined()
        }
    })

    // The default request (no `request` option): the platform fetch is the fake, so the
    // body the hook really posts is read, not the test's own input.
    it('posts { documents } to the send route: a single item with subject and body, batch items with neither', async () => {
        const posted: { url: string; method: string | undefined; body: unknown }[] = []
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init?: RequestInit) => {
                posted.push({
                    url: String(url),
                    method: init?.method,
                    body: JSON.parse(String(init?.body)),
                })
                return new Response(JSON.stringify({ sent: [], failed: [] }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                })
            })
        )
        const { result } = renderHook(() => useDocumentSend(), { wrapper })

        await act(async () => {
            await result.current.mutateAsync([SINGLE])
        })
        await act(async () => {
            await result.current.mutateAsync([
                { kind: 'invoice', id: INVOICE_ID, to: TO, cc: [] },
                { kind: 'sales_receipt', id: OTHER_ID, to: TO, cc: [] },
            ])
        })

        expect(posted.map(p => [p.url, p.method])).toEqual([
            [`https://books.test${DOCUMENT_SEND_PATH}`, 'POST'],
            [`https://books.test${DOCUMENT_SEND_PATH}`, 'POST'],
        ])
        expect(posted[0]?.body).toEqual({
            documents: [
                {
                    kind: 'invoice',
                    id: INVOICE_ID,
                    to: TO,
                    cc: ['ap@cedarhollow.example'],
                    subject: 'Invoice 1004 from Hartwell Supply Co.',
                    body: '<p><strong>Thank you</strong></p>',
                },
            ],
        })
        expect(posted[1]?.body).toEqual({
            documents: [
                { kind: 'invoice', id: INVOICE_ID, to: TO, cc: [] },
                { kind: 'sales_receipt', id: OTHER_ID, to: TO, cc: [] },
            ],
        })
        const batchItems = (posted[1]?.body as { documents: Record<string, unknown>[] }).documents
        for (const item of batchItems) {
            expect(Object.keys(item).sort()).toEqual(['cc', 'id', 'kind', 'to'])
        }
    })

    it('rejects an answer that does not parse with the unreadable-answer text, and files nothing', async () => {
        const request = vi.fn(
            async (_items: DocumentSendItem[]): Promise<unknown> => ({ sent: 'yes', failed: null })
        )
        const { result } = renderHook(() => useDocumentSend({ request }), { wrapper })

        let failure: unknown
        await act(async () => {
            await result.current.mutateAsync([SINGLE]).catch((error: unknown) => {
                failure = error
            })
        })

        expect(failure).toBeInstanceOf(Error)
        expect((failure as Error).message).toMatch(/answer to the send could not be read/)
        expect(storedIds()).toEqual([])
    })

    it("rejects a refused request with the server's message, and files nothing", async () => {
        const request = vi.fn(async (_items: DocumentSendItem[]): Promise<unknown> => {
            throw messageRefusal(NOT_SET_UP)
        })
        const { result } = renderHook(() => useDocumentSend({ request }), { wrapper })

        let failure: unknown
        await act(async () => {
            await result.current.mutateAsync([SINGLE]).catch((error: unknown) => {
                failure = error
            })
        })

        expect(failure).toBeInstanceOf(Error)
        expect((failure as Error).message).toBe(NOT_SET_UP)
        expect(storedIds()).toEqual([])
    })
})
