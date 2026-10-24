import { eq, or } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { useEffect } from 'react'
import { useBooksAccess } from './useBooksAccess'

export function useEntryDetail(entryId: string) {
    const [entriesCollection, linesCollection, accountsCollection, usersCollection] = useStore(
        'books_journal_entries',
        'books_journal_lines',
        'books_accounts',
        'users'
    )
    const access = useBooksAccess()
    const { record: entry, isLoading } = useRecord(entriesCollection, entryId)
    const { data: lines = [], isReady: linesReady } = useLiveQuery({
        query: query =>
            query
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.entry, entryId))
                .orderBy(({ line }) => line.position),
        queryKey: ['books.entry.lines', entryId],
    })
    const { data: accounts = [], isReady: accountsReady } = useLiveQuery({
        query: query => query.from({ account: accountsCollection }),
        queryKey: ['books.entry.accounts'],
    })
    const { data: linked = [], isReady: linkedReady } = useLiveQuery({
        query: query =>
            query
                .from({ e: entriesCollection })
                .where(({ e }) => or(eq(e.reverses, entryId), eq(e.replaces, entryId))),
        queryKey: ['books.entry.linked', entryId],
    })
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
        // A posted reversal is the one that counts; a draft or void one may sit beside it.
        reversedBy: reversals.find(row => row.status === 'posted') ?? reversals[0],
        replacedBy: linked.find(row => row.replaces === entryId),
        reversesEntry,
        replacesEntry,
        postedByName: postedBy?.name,
        voidedByName: voidedBy?.name,
        canWrite: access.canWrite,
        currency: entry?.currency ?? 'USD',
    }
    const relatedLoading = reversesLoading || replacesLoading || postedByLoading || voidedByLoading
    if (isLoading || !linesReady || !accountsReady || !linkedReady || relatedLoading) {
        return { ...detail, viewState: 'loading' as const, entry: undefined, isEditable: false }
    }
    if (!entry) {
        return { ...detail, viewState: 'not-found' as const, entry: undefined, isEditable: false }
    }
    return {
        ...detail,
        viewState: 'ready' as const,
        entry,
        isEditable: entry.status === 'draft' && access.canWrite,
    }
}

export type EntryDetailModel = ReturnType<typeof useEntryDetail>
export type ReadyEntryDetail = Extract<EntryDetailModel, { viewState: 'ready' }>
