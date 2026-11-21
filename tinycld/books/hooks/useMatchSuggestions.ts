import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { suggestionsByTxn } from '../lib/bank-match'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// The suggestions of every For review transaction of one connection, each with its entry
// (the row mark names the one suggestion: "1 match · Transfer 1007 · Sep 3, 2026"). One
// query over the view books_bank_match_suggestions, which the server keeps live. A null
// connection disables the query (the Reviewed and Excluded tabs show no mark).
function useSuggestionsQuery(connectionId: string | null) {
    const [suggestions, entries] = useStore('books_bank_match_suggestions', 'books_journal_entries')
    const query = useLiveQuery({
        query: q => {
            if (!connectionId) return null
            return q
                .from({ s: suggestions })
                .where(({ s }) => eq(s.connection, connectionId))
                .orderBy(({ s }) => s.days_apart, 'asc')
                .orderBy(({ s }) => s.id, 'asc')
                .select(({ s }) => ({
                    id: s.id,
                    bank_transaction: s.bank_transaction,
                    line: s.line,
                    entry: materialize(
                        q
                            .from({ e: entries })
                            .where(({ e }) => eq(e.id, s.entry))
                            .select(({ e }) => ({
                                id: e.id,
                                number: e.number,
                                doc_type: e.doc_type,
                                origin: e.origin,
                                date: e.date,
                                document: e.document,
                            }))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.match.suggestions', connectionId],
    })
    return { query, sources: [suggestions, entries] }
}

export type RowSuggestion = NonNullable<
    ReturnType<typeof useSuggestionsQuery>['query']['data']
>[number]

// The list's suggestions by bank transaction (suggestionsByTxn, one pass). While they
// load, or when the read failed, the map is empty, so each row keeps its memo line; a
// failed read hands its recovery to the list's Retry and to the drawer's Match Retry. The
// page reads it once (useBankingScreen) for the selected connection's For review tab.
export function useMatchSuggestions(connectionId: string | null) {
    const { query, sources } = useSuggestionsQuery(connectionId)
    const isEnabled = connectionId !== null && connectionId !== ''
    const isReady = isEnabled && query.isReady && !query.isError
    const rows = isReady ? (query.data ?? []) : []
    const isError = isEnabled && query.isError
    const recovery: LiveRecovery =
        isError && query.collection ? { queries: [query.collection], sources } : NO_RECOVERY
    return {
        byTxn: suggestionsByTxn(rows),
        isLoading: isEnabled && !query.isReady && !query.isError,
        isError,
        recovery,
    }
}

export type MatchSuggestions = ReturnType<typeof useMatchSuggestions>
