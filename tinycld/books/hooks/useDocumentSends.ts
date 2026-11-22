import { and, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useEffect } from 'react'
import type { SendKind } from '../lib/document-send'

/**
 * The sends of one document (spec §3.6, §4.1 "Sent line"): one live query over
 * `books_document_sends` where `doc_type` and `document` match, newest first. `latest` is
 * the newest send (undefined while none is known) and `count` the number of sends. A
 * failed read gives no send and is logged as a warning: the sent line is not an action, and
 * the read view's own load error covers the document.
 */
export function useDocumentSends(kind: SendKind, documentId: string) {
    const [sendsCollection] = useStore('books_document_sends')
    const sendsQuery = useLiveQuery({
        query: q => {
            if (documentId === '') return undefined
            return q
                .from({ send: sendsCollection })
                .where(({ send }) => and(eq(send.doc_type, kind), eq(send.document, documentId)))
                .orderBy(({ send }) => send.created, 'desc')
        },
        queryKey: ['books.document.sends', kind, documentId],
    })
    const { isError } = sendsQuery
    useEffect(() => {
        if (isError) {
            log.warn('books.document.sends', 'the sends of a document did not load', {
                kind,
                documentId,
            })
        }
    }, [isError, kind, documentId])
    const sends = isError ? [] : (sendsQuery.data ?? [])
    return { latest: sends[0], count: sends.length, isError }
}
