import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useMemo } from 'react'
import {
    type EntriesRange,
    type EntriesStatusFilter,
    entriesWhere,
    entryMatchesSearch,
    searchTerm,
} from '../lib/entries-query'
import { fiscalStartMonth, rangeForPreset, todayIso } from '../lib/register-range'

interface EntriesFilters {
    status: EntriesStatusFilter
    search: string
    range: EntriesRange
}

export function useEntriesQuery(filters: EntriesFilters, limit: number) {
    const [entriesCollection, settingsCollection] = useStore(
        'books_journal_entries',
        'books_settings'
    )
    const settingsQuery = useLiveQuery({
        query: query => query.from({ settings: settingsCollection }),
        queryKey: ['books.entries.settings'],
    })
    const settings = settingsQuery.data?.[0]
    const isSettingsReady = settingsQuery.isReady
    // The preset waits for the settings, because the fiscal year start month moves its bounds.
    const range =
        filters.range === 'all-dates' || !isSettingsReady
            ? null
            : rangeForPreset(filters.range, todayIso(), fiscalStartMonth(settings))
    const { status } = filters
    const search = searchTerm(filters.search)
    const isSearching = search !== ''
    const entriesQuery = useLiveQuery({
        query: query => {
            if (!isSettingsReady) return undefined
            const base = entriesWhere({ status, search: '' }, range).reduce(
                (q, clause) => q.where(clause),
                query.from({ entry: entriesCollection })
            )
            // Any fn.where forces a full-source scan, so only the search path pays for it.
            // Its rows are cut client-side, because a server-side limit would drop rows before the search runs.
            if (isSearching) {
                return base.fn
                    .where(({ entry }) => entryMatchesSearch(entry, search))
                    .orderBy(({ entry }) => entry.date, 'desc')
                    .orderBy(({ entry }) => entry.created, 'desc')
            }
            return base
                .orderBy(({ entry }) => entry.date, 'desc')
                .orderBy(({ entry }) => entry.created, 'desc')
                .limit(limit)
        },
        queryKey: [
            'books.entries.list',
            isSettingsReady,
            status,
            search,
            range?.start,
            range?.end,
            isSearching ? null : limit,
        ],
    })

    const data = entriesQuery.data
    const entries = useMemo(
        () => (isSearching ? data?.slice(0, limit) : data),
        [data, isSearching, limit]
    )

    const retry = () => {
        void recoverLiveQueries({
            queries: [settingsQuery.collection, entriesQuery.collection],
            sources: [settingsCollection, entriesCollection],
            onError: err => log.error('books.entries', err),
        })
    }

    return {
        entries,
        currency: settings?.currency ?? 'USD',
        isReady: isSettingsReady && entriesQuery.isReady,
        isError: settingsQuery.isError || entriesQuery.isError,
        retry,
    }
}
