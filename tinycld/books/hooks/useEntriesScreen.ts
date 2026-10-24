import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { entriesFilterActive } from '../lib/entries-query'
import { newEntryVisible } from '../lib/register-state'
import { isNewActionAvailable } from '../lib/shell-nav'
import { useEntriesUiStore } from '../stores/entries-ui-store'
import { useBooksAccess } from './useBooksAccess'
import { useEntriesQuery } from './useEntriesQuery'

const NEW_ENTRY_ACTION = 'journal-entry'
// Checkpoint 3 renders rows through a row window; until then the query is capped here.
const ENTRIES_LIMIT = 200

type EntriesViewState = 'loading' | 'error' | 'empty' | 'no-match' | 'ready'

function viewStateOf(input: {
    isReady: boolean
    isError: boolean
    hasRows: boolean
    isFilterActive: boolean
}): EntriesViewState {
    if (input.isError) return 'error'
    if (!input.isReady) return 'loading'
    if (input.hasRows) return 'ready'
    return input.isFilterActive ? 'no-match' : 'empty'
}

export function useEntriesScreen() {
    const status = useEntriesUiStore(s => s.status)
    const search = useEntriesUiStore(s => s.search)
    const range = useEntriesUiStore(s => s.range)
    const clearFilters = useEntriesUiStore(s => s.clearFilters)
    const access = useBooksAccess()
    const orgHref = useOrgHref()
    const filters = { status, search, range }
    const query = useEntriesQuery(filters, ENTRIES_LIMIT)
    const entries = query.entries ?? []

    return {
        viewState: viewStateOf({
            isReady: query.isReady,
            isError: query.isError,
            hasRows: entries.length > 0,
            isFilterActive: entriesFilterActive(filters),
        }),
        canWrite: newEntryVisible({
            canWrite: access.canWrite,
            isAvailable: isNewActionAvailable(NEW_ENTRY_ACTION),
        }),
        onNew: () => router.push(orgHref('books/entries/new')),
        filters,
        entries,
        currency: query.currency,
        onRetry: query.retry,
        onClearFilters: clearFilters,
    }
}

export type EntriesScreenModel = ReturnType<typeof useEntriesScreen>
