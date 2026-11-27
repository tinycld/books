import { and, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { router, useIsFocused } from 'expo-router'
import { useEffect, useRef } from 'react'
import { DOCUMENT_SCREENS, type DocumentCollectionName } from '../lib/document-screens'
import type { CodedCollectionName } from '../lib/record-code'
import { codeUrlKey, documentKey, entryKey, parseCodeKey, parseRecordKey } from '../lib/record-key'
import { useRouteKeyStore } from '../stores/route-key-store'

// The numbered document collections whose route takes a URL key live in
// lib/document-screens.ts, which a lib reads with no React import.
export { DOCUMENT_SCREENS, type DocumentCollectionName } from '../lib/document-screens'

export const ENTRY_SCREENS = { journal: 'entries/[id]', transfer: 'transfers/[id]' } as const

// The collections whose route takes a code (lib/record-code.ts), with the stack's screen name.
const CODE_SCREENS = {
    books_customers: 'customers/[id]',
    books_vendors: 'vendors/[id]',
    books_products: 'products/[id]',
} as const satisfies Record<CodedCollectionName, string>

// Once the record is read, records which id the key names (route-key-store), so the
// stack and the lists find this screen by the record id.
function useRememberKey(screenName: string, key: string, id: string | undefined) {
    const remember = useRouteKeyStore(s => s.remember)
    useEffect(() => {
        if (id) remember(screenName, key, id)
    }, [remember, screenName, key, id])
}

// The id a mounted route first read for its key. A number can name another record later
// (a void hands an entry's number to nothing, a correction takes a document's), and the
// screen must keep showing the record it opened.
function useFirstRead(key: string, id: string | undefined): string | undefined {
    const first = useRef<{ key: string; id: string } | null>(null)
    if (id && first.current?.key !== key) first.current = { key, id }
    return first.current?.key === key ? first.current.id : id
}

// What a document route's key read gives its route: the record id (undefined while it is
// read, or when the read failed), whether the number-key read failed (the route shows its
// screen's load error, with Retry), and the Retry that restarts that read.
export type DocumentRouteRead = {
    id: string | undefined
    isError: boolean
    retry: () => void
}

// The record id a document route's key names. A number key reads the documents of that
// sequence: the void original of a correction shares it, so the one that no correction
// replaced is the document. A key that names no document gives the key back, so the screen
// shows its own not-found state. A refused number-key read gives `isError` until Retry
// restarts it (a failed live query does not recover on a reload of its collection).
export function useDocumentRouteId(
    collectionName: DocumentCollectionName,
    key: string | undefined
): DocumentRouteRead {
    const urlKey = key ?? ''
    const parsed = parseRecordKey(urlKey)
    const [collection] = useStore(collectionName)
    const query = useLiveQuery({
        query: q => {
            // An id key names its record itself: no read, so the screen's own read is the
            // only one (a refused read shows the screen's error).
            if (parsed.kind !== 'sequence') return undefined
            return q.from({ doc: collection }).where(({ doc }) => eq(doc.sequence, parsed.sequence))
        },
        queryKey: ['books.route-record', collectionName, urlKey],
    })
    const doc = (query.data ?? []).find(row => !('replaced_by' in row) || !row.replaced_by)
    const id = useFirstRead(urlKey, doc?.id)
    useRememberKey(DOCUMENT_SCREENS[collectionName], urlKey, id)
    const retry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [collection],
            onError: err => log.error('books.route-record', err, { collectionName }),
        })
    }
    if (parsed.kind === 'id') return { id: parsed.id, isError: false, retry }
    if (id) return { id, isError: false, retry }
    if (query.isError) return { id: undefined, isError: true, retry }
    if (!query.isReady) return { id: undefined, isError: false, retry }
    return { id: urlKey, isError: false, retry }
}

// A route opened by a code follows its record's code: after the code changes, the URL
// takes the new code, so a reload and a copied link open the record. A code typed in
// another case is the same code (the router does not tell the two paths apart), and a
// route opened by an id keeps the id. `router.setParams` acts on the focused route, so a
// screen under another one (a customer page under its invoice) follows once it is on top
// again, never by moving the screen above it.
function useFollowCode(collectionName: CodedCollectionName, key: string, id: string) {
    const isFocused = useIsFocused()
    const [collection] = useStore(collectionName)
    const { data } = useLiveQuery({
        query: q =>
            id === '' ? undefined : q.from({ row: collection }).where(({ row }) => eq(row.id, id)),
        queryKey: ['books.code-route-follow', collectionName, id],
    })
    const row = data?.[0]
    const ownKey = row ? codeUrlKey(row) : ''
    useEffect(() => {
        if (!isFocused || ownKey === '' || ownKey === id) return
        if (ownKey !== key.toUpperCase()) router.setParams({ id: ownKey })
    }, [isFocused, ownKey, id, key])
}

// The record id a customer, vendor or product route's key names, or undefined while it is
// read. A code key (any case) reads the record of that code, and the route keeps the
// record it first read when the code changes; an id key names its record itself. A key
// that names no record gives the key back, so the screen shows its own not-found state.
export function useCodeRouteId(
    collectionName: CodedCollectionName,
    key: string | undefined
): string | undefined {
    const urlKey = key ?? ''
    const parsed = parseCodeKey(urlKey)
    const [collection] = useStore(collectionName)
    const { data, isReady } = useLiveQuery({
        query: q => {
            if (parsed.kind !== 'code') return undefined
            return q.from({ row: collection }).where(({ row }) => eq(row.code, parsed.code))
        },
        queryKey: ['books.code-route-record', collectionName, urlKey],
    })
    const id = useFirstRead(urlKey, data?.[0]?.id)
    useRememberKey(CODE_SCREENS[collectionName], urlKey, id)
    useFollowCode(collectionName, urlKey, parsed.kind === 'code' ? (id ?? '') : '')
    if (parsed.kind === 'id') return parsed.id
    if (id) return id
    if (!isReady) return undefined
    return urlKey
}

// The URL key of a stored customer, vendor or product at a navigation, one time (never
// rendered from): its code, or its id while it has none.
export function useStoredCodeKey(collectionName: CodedCollectionName): (id: string) => string {
    const [collection] = useStore(collectionName)
    return id => {
        const row = collection.get(id)
        return row ? codeUrlKey(row) : id
    }
}

// The id of the entry an entry route's key names (`books/entries/<n>` for a journal
// entry, `books/transfers/<n>` for a manual transfer), or undefined while it is read. The
// number names the posted entry of the doc type; a void reversal shares its entry's number.
export function useEntryRouteId(
    docType: keyof typeof ENTRY_SCREENS,
    key: string | undefined
): string | undefined {
    const urlKey = key ?? ''
    const parsed = parseRecordKey(urlKey)
    const [entriesCollection] = useStore('books_journal_entries')
    const { data, isReady } = useLiveQuery({
        query: q => {
            if (parsed.kind !== 'sequence') return undefined
            return q
                .from({ entry: entriesCollection })
                .where(({ entry }) =>
                    and(
                        eq(entry.doc_type, docType),
                        eq(entry.sequence, parsed.sequence),
                        eq(entry.status, 'posted')
                    )
                )
        },
        queryKey: ['books.route-entry', docType, urlKey],
    })
    const entry = (data ?? []).find(row => row.origin !== 'void_reversal')
    const id = useFirstRead(urlKey, entry?.id)
    useRememberKey(ENTRY_SCREENS[docType], urlKey, id)
    if (parsed.kind === 'id') return parsed.id
    if (id) return id
    if (!isReady) return undefined
    return urlKey
}

// Reads the URL key of a stored entry at a save, one time (never rendered from): its
// number once the store holds it posted, else its id. A save opens this, so a post lands on
// `…/entries/<number>` or `…/transfers/<number>`.
export function useStoredEntryKey(): (id: string) => string {
    const [entriesCollection] = useStore('books_journal_entries')
    return id => {
        const row = entriesCollection.get(id)
        return row ? entryKey(row) : id
    }
}

// The same for a stored document of `collectionName`.
export function useStoredDocumentKey(
    collectionName: DocumentCollectionName
): (id: string) => string {
    const [collection] = useStore(collectionName)
    return id => {
        const row = collection.get(id)
        return row ? documentKey(row) : id
    }
}
