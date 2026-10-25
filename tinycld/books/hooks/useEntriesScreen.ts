import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { entriesFilterActive, entriesViewState } from '../lib/entries-query'
import { newEntryVisible } from '../lib/register-state'
import { isNewActionAvailable } from '../lib/shell-nav'
import { useEntriesUiStore } from '../stores/entries-ui-store'
import { useBooksAccess } from './useBooksAccess'
import { useEntriesQuery } from './useEntriesQuery'

const NEW_ENTRY_ACTION = 'journal-entry'

export function useEntriesScreen() {
    const status = useEntriesUiStore(s => s.status)
    const search = useEntriesUiStore(s => s.search)
    const range = useEntriesUiStore(s => s.range)
    const rowLimit = useEntriesUiStore(s => s.rowLimit)
    const growRowLimit = useEntriesUiStore(s => s.growRowLimit)
    const clearFilters = useEntriesUiStore(s => s.clearFilters)
    const breakpoint = useBreakpoint()
    const access = useBooksAccess()
    const orgHref = useOrgHref()
    const filters = { status, search, range }
    const query = useEntriesQuery(filters, rowLimit)
    const entries = query.entries ?? []

    return {
        viewState: entriesViewState({
            isReady: query.isReady,
            isError: query.isError,
            hasRows: entries.length > 0,
            isFilterActive: entriesFilterActive(filters),
            keepsRows: query.keepsRows,
        }),
        canWrite: newEntryVisible({
            canWrite: access.canWrite,
            isAvailable: isNewActionAvailable(NEW_ENTRY_ACTION),
        }),
        onNew: () => router.push(orgHref('books/entries/new')),
        filters,
        entries,
        currency: query.currency,
        isWide: breakpoint !== 'mobile',
        onOpenEntry: (entryId: string) => router.push(orgHref(`books/entries/${entryId}`)),
        // A full page means more rows may exist; a short one has loaded everything the filter asks for.
        onNearEnd: () => {
            if (entries.length >= rowLimit) growRowLimit(rowLimit)
        },
        onRetry: query.retry,
        onClearFilters: clearFilters,
    }
}

export type EntriesScreenModel = ReturnType<typeof useEntriesScreen>
