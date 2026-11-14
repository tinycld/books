import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { entriesFilterActive, entriesViewState } from '../lib/entries-query'
import { type EntryActionId, entryActions, voidsFromDocument } from '../lib/entry-actions'
import { autoReversalOverdueAt, autoReversalState } from '../lib/entry-display'
import { entryEditHref, entryHref } from '../lib/entry-route'
import { newEntryVisible } from '../lib/register-state'
import { isNewActionAvailable } from '../lib/shell-nav'
import { useEntriesUiStore } from '../stores/entries-ui-store'
import { useBooksAccess } from './useBooksAccess'
import { useClockTick } from './useClockTick'
import { useEntriesQuery } from './useEntriesQuery'
import { useReversedIds } from './useReversedIds'

const NEW_ENTRY_ACTION = 'journal-entry'

export function useEntriesScreen() {
    const status = useEntriesUiStore(s => s.status)
    const search = useEntriesUiStore(s => s.search)
    const range = useEntriesUiStore(s => s.range)
    const rowLimit = useEntriesUiStore(s => s.rowLimit)
    const growRowLimit = useEntriesUiStore(s => s.growRowLimit)
    const clearFilters = useEntriesUiStore(s => s.clearFilters)
    const openDialog = useEntriesUiStore(s => s.openDialog)
    const breakpoint = useBreakpoint()
    const access = useBooksAccess()
    const orgHref = useOrgHref()
    const filters = { status, search, range }
    const query = useEntriesQuery(filters, rowLimit)
    const entries = query.entries ?? []
    const reversed = useReversedIds(entries.map(entry => entry.id))
    const entriesById = new Map(entries.map(entry => [entry.id, entry]))
    // The clock re-renders the list at the moment the next scheduled reversal becomes overdue.
    const overdueTimes = entries.flatMap(entry => {
        const at = autoReversalOverdueAt(entry)
        return at === null ? [] : [at]
    })
    const now = useClockTick(overdueTimes)
    // Unknown until the reversal rows of the entry have answered: a reversed entry must
    // not flash the mark.
    const isOverdue = (entryId: string) => {
        const entry = entriesById.get(entryId)
        if (!entry || !reversed.isKnown(entryId)) return false
        return autoReversalState(entry, reversed.reversalsOf(entryId), now) === 'overdue'
    }
    // A row not in the map (it left the window between render and press) opens on the
    // journal entry screen, which shows an entry of any type.
    const onOpenEntry = (entryId: string) =>
        router.push(
            orgHref(
                entryHref(
                    entriesById.get(entryId) ?? {
                        id: entryId,
                        doc_type: 'journal',
                        origin: 'manual',
                        document: '',
                    }
                )
            )
        )
    // Edit needs the row's type and origin to pick its form; without the row, open the
    // entry instead, whose own Edit reads them.
    const onEditEntry = (entryId: string) => {
        const entry = entriesById.get(entryId)
        if (entry) router.push(orgHref(entryEditHref(entry)))
        else onOpenEntry(entryId)
    }

    // A document's entry is voided from its document (the server refuses it here), so
    // its Void opens the document, whose own Void posts the reversal.
    const onVoidEntry = (entryId: string) => {
        const entry = entriesById.get(entryId)
        if (entry && voidsFromDocument(entry)) onOpenEntry(entryId)
        else openDialog('void', entryId)
    }

    const onMenuAction = (action: EntryActionId, entryId: string) => {
        if (action === 'open') onOpenEntry(entryId)
        else if (action === 'edit') onEditEntry(entryId)
        else if (action === 'void') onVoidEntry(entryId)
        else openDialog(action, entryId)
    }
    const menuActions = (entryId: string) => {
        const entry = entriesById.get(entryId)
        if (!entry) return []
        const isReversed = reversed.ids.has(entryId)
        const actions = entryActions({ ...entry, isReversed }, { canWrite: access.canWrite })
        // Reversal state is unknown until the query answers; offering Reverse could double-reverse.
        return reversed.isReady ? actions : actions.filter(action => action !== 'reverse')
    }

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
        onOpenEntry,
        entriesById,
        menuActions,
        isOverdue,
        onMenuAction,
        // A full page means more rows may exist; a short one has loaded everything the filter asks for.
        onNearEnd: () => {
            if (entries.length >= rowLimit) growRowLimit(rowLimit)
        },
        onRetry: query.retry,
        onClearFilters: clearFilters,
    }
}

export type EntriesScreenModel = ReturnType<typeof useEntriesScreen>
