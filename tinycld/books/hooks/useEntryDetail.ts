import { eq, or } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useRecord } from '@tinycld/core/lib/use-record'
import { materialize } from 'pbtsdb'
import { useEffect } from 'react'
import { entryInitialValues } from '../lib/entry-initial'
import { linePartyName } from '../lib/line-party-options'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { useBooksAccess } from './useBooksAccess'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

export function useEntryDetail(entryId: string) {
    const [entriesCollection, linesCollection, accountsCollection, usersCollection] = useStore(
        'books_journal_entries',
        'books_journal_lines',
        'books_accounts',
        'users'
    )
    const [customersCollection, vendorsCollection, accessCollection] = useStore(
        'books_customers',
        'books_vendors',
        'books_access'
    )
    const access = useBooksAccess()
    const { record: entry, isLoading } = useRecord(entriesCollection, entryId)
    // Each line materializes its customer's and vendor's display name (the read view's
    // Name), so an inactive party still shows: the line keeps it.
    const linesQuery = useLiveQuery({
        query: query =>
            query
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.entry, entryId))
                .orderBy(({ line }) => line.position)
                .select(({ line }) => ({
                    ...line,
                    customerRow: materialize(
                        query
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, line.customer))
                            .select(({ c }) => ({ display_name: c.display_name }))
                            .findOne()
                    ),
                    vendorRow: materialize(
                        query
                            .from({ v: vendorsCollection })
                            .where(({ v }) => eq(v.id, line.vendor))
                            .select(({ v }) => ({ display_name: v.display_name }))
                            .findOne()
                    ),
                })),
        queryKey: ['books.entry.lines', entryId],
    })
    const linesReady = linesQuery.isReady
    const lines = (linesQuery.data ?? []).map(line => ({
        ...line,
        partyName: linePartyName(line),
    }))
    const accountsQuery = useLiveQuery({
        query: query => query.from({ account: accountsCollection }),
        queryKey: ['books.entry.accounts'],
    })
    const accounts = accountsQuery.data ?? []
    const accountsReady = accountsQuery.isReady
    const linkedQuery = useLiveQuery({
        query: query =>
            query
                .from({ e: entriesCollection })
                .where(({ e }) => or(eq(e.reverses, entryId), eq(e.replaces, entryId))),
        queryKey: ['books.entry.linked', entryId],
    })
    const linked = linkedQuery.data ?? []
    const linkedReady = linkedQuery.isReady

    const loadFailed =
        linesQuery.isError || accountsQuery.isError || linkedQuery.isError || access.isError
    // Each part is non-empty only when its own query failed, so one call recovers exactly
    // the failed reads and never empties a collection another screen is showing.
    const linesRecovery: LiveRecovery = linesQuery.isError
        ? {
              queries: [linesQuery.collection],
              sources: [linesCollection, customersCollection, vendorsCollection],
          }
        : NO_RECOVERY
    const accountsRecovery: LiveRecovery = accountsQuery.isError
        ? { queries: [accountsQuery.collection], sources: [accountsCollection] }
        : NO_RECOVERY
    const linkedRecovery: LiveRecovery = linkedQuery.isError
        ? { queries: [linkedQuery.collection], sources: [entriesCollection] }
        : NO_RECOVERY
    const accessRecovery: LiveRecovery = access.isError
        ? { queries: [access.collection], sources: [accessCollection] }
        : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([linesRecovery, accountsRecovery, linkedRecovery, accessRecovery]),
            onError: err => log.error('books.entries', err),
        })
    }
    const { record: reversesEntry, isLoading: reversesLoading } = useRecord(
        entriesCollection,
        entry?.reverses
    )
    const { record: replacesEntry, isLoading: replacesLoading } = useRecord(
        entriesCollection,
        entry?.replaces
    )
    const { record: postedBy, isLoading: postedByLoading } = useRecord(
        usersCollection,
        entry?.posted_by
    )
    const { record: voidedBy, isLoading: voidedByLoading } = useRecord(
        usersCollection,
        entry?.voided_by
    )

    const accountNames = new Map(
        accounts.map(account => [account.id, `${account.number} ${account.name}`.trim()])
    )
    const missingAccountIds = accountsReady
        ? [...new Set(lines.map(line => line.account))].filter(id => !accountNames.has(id))
        : []
    const missingKey = missingAccountIds.join(',')
    // Keyed by the id list so a re-render does not log again.
    useEffect(() => {
        for (const accountId of missingKey.split(',').filter(Boolean)) {
            log.warn('books.entries', 'line account not found', { accountId })
        }
    }, [missingKey])
    for (const id of missingAccountIds) accountNames.set(id, 'Unknown account')

    const reversals = linked.filter(row => row.reverses === entryId)

    const detail = {
        lines,
        accountNames,
        // Every row that reverses this entry, of any status: the state of an automatic
        // reversal reads them all (autoReversalState, lib/entry-display.ts).
        reversals,
        // A posted reversal is the one that counts; a draft or void one may sit beside it.
        reversedBy: reversals.find(row => row.status === 'posted') ?? reversals[0],
        replacedBy: linked.find(row => row.replaces === entryId),
        reversesEntry,
        replacesEntry,
        postedByName: postedBy?.name,
        voidedByName: voidedBy?.name,
        canWrite: access.canWrite,
        currency: entry?.currency ?? 'USD',
        loadFailed,
        retry,
    }
    // A replacement draft's header names the original, so it is not ready before that row is.
    const awaitsOriginal = entry?.status === 'draft' && !!entry.replaces && !replacesEntry
    const relatedLoading =
        awaitsOriginal || reversesLoading || replacesLoading || postedByLoading || voidedByLoading
    // A failed read never becomes ready, so it is checked before loading.
    if (loadFailed) {
        return { ...detail, viewState: 'error' as const, entry: undefined, isEditable: false }
    }
    // A writer must not see the read-only view while the access row is still loading.
    if (
        isLoading ||
        !access.isReady ||
        !linesReady ||
        !accountsReady ||
        !linkedReady ||
        relatedLoading
    ) {
        return { ...detail, viewState: 'loading' as const, entry: undefined, isEditable: false }
    }
    if (!entry) {
        return { ...detail, viewState: 'not-found' as const, entry: undefined, isEditable: false }
    }
    return {
        ...detail,
        viewState: 'ready' as const,
        entry,
        initialValues: entryInitialValues(entry, lines, detail.currency),
        isEditable: entry.status === 'draft' && access.canWrite,
    }
}

export type EntryDetailModel = ReturnType<typeof useEntryDetail>
export type ReadyEntryDetail = Extract<EntryDetailModel, { viewState: 'ready' }>
