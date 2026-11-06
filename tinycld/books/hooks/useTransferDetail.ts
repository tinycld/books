import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { materialize } from 'pbtsdb'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { transferFromLines, transferViewState } from '../lib/transfer'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'
import { useTransferAccounts } from './useTransferAccounts'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// One transfer by id: the entry with the people who posted and voided it, its two lines,
// the accounts they name, and the screen state they add up to.
export function useTransferDetail(entryId: string) {
    const [entriesCollection, linesCollection, usersCollection, accessCollection] = useStore(
        'books_journal_entries',
        'books_journal_lines',
        'users',
        'books_access'
    )
    const access = useBooksAccess()
    const settings = useBooksSettings()
    const accounts = useTransferAccounts()
    const entryQuery = useLiveQuery({
        query: q =>
            q
                .from({ entry: entriesCollection })
                .where(({ entry }) => eq(entry.id, entryId))
                .select(({ entry }) => ({
                    ...entry,
                    postedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, entry.posted_by))
                            .findOne()
                    ),
                    voidedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, entry.voided_by))
                            .findOne()
                    ),
                })),
        queryKey: ['books.transfer.entry', entryId],
    })
    const linesQuery = useLiveQuery({
        query: q =>
            q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.entry, entryId))
                .orderBy(({ line }) => line.position),
        queryKey: ['books.transfer.lines', entryId],
    })
    const entry = entryQuery.data?.[0]
    const lines = linesQuery.data ?? []
    // The posted transfer a correction replaces, for its number. A live query, not
    // `useRecord`: a refused read must show as an error with Retry, never as a ready
    // correction with no number. With nothing replaced the query is disabled.
    const replacesId = entry?.replaces ?? ''
    const replacesQuery = useLiveQuery({
        query: q => {
            if (!replacesId) return undefined
            return q
                .from({ original: entriesCollection })
                .where(({ original }) => eq(original.id, replacesId))
        },
        queryKey: ['books.transfer.replaces', replacesId],
    })
    // A disabled query reports ready, so the id is checked as well as `isEnabled`.
    const isReplacesReady = !replacesId || (replacesQuery.isEnabled && replacesQuery.isReady)

    const currency = entry?.currency || settings.settings?.currency || 'USD'
    const { from, to, amount, ids } = transferFromLines(lines, currency)
    const isReady =
        access.isReady &&
        settings.isReady &&
        accounts.isReady &&
        entryQuery.isReady &&
        linesQuery.isReady &&
        isReplacesReady
    const isError =
        entryQuery.isError ||
        linesQuery.isError ||
        replacesQuery.isError ||
        accounts.isError ||
        access.isError ||
        settings.hasLoadError

    // Each part is non-empty only when its own query failed, so one call recovers
    // exactly the failed reads and never empties a collection another screen is showing.
    const entryRecovery: LiveRecovery = entryQuery.isError
        ? { queries: [entryQuery.collection], sources: [entriesCollection, usersCollection] }
        : NO_RECOVERY
    const linesRecovery: LiveRecovery = linesQuery.isError
        ? { queries: [linesQuery.collection], sources: [linesCollection] }
        : NO_RECOVERY
    const replacesRecovery: LiveRecovery =
        replacesQuery.isError && replacesQuery.collection
            ? { queries: [replacesQuery.collection], sources: [entriesCollection] }
            : NO_RECOVERY
    const accessRecovery: LiveRecovery = access.isError
        ? { queries: [access.collection], sources: [accessCollection] }
        : NO_RECOVERY
    const onRetry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([
                entryRecovery,
                linesRecovery,
                replacesRecovery,
                accounts.recovery,
                settings.recovery,
                accessRecovery,
            ]),
            onError: err => log.error('books.transfer', err),
        })
    }

    const viewState = transferViewState({
        isError,
        isReady,
        hasEntry: entry !== undefined,
        docType: entry?.doc_type,
        origin: entry?.origin,
    })
    const detail = {
        lines,
        from,
        to,
        amount,
        amountCents: entry?.total ?? 0,
        ids,
        currency,
        canWrite: access.canWrite,
        postedByName: entry?.postedBy?.name,
        voidedByName: entry?.voidedBy?.name,
        replacesNumber: replacesQuery.data?.[0]?.number,
        accounts,
        onRetry,
    }
    if (viewState === 'ready' && entry) return { ...detail, viewState, entry }
    // A ready state always has its entry; the fallback only satisfies the type.
    return {
        ...detail,
        viewState: viewState === 'ready' ? ('not-found' as const) : viewState,
        entry: undefined,
    }
}

export type TransferDetail = ReturnType<typeof useTransferDetail>
export type ReadyTransferDetail = Extract<TransferDetail, { viewState: 'ready' }>
