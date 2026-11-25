import { eq, ilike, or } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { PICKER_LIMIT } from '../../lib/customer-tree'
import { allOf } from '../../lib/document-list'
import type { ListArea } from '../../lib/list-areas'
import { searchPieces } from '../../lib/list-search'
import { type LiveRecovery, mergeRecoveries } from '../../lib/live-recovery'
import { SearchPicker, useSearchPicker } from '../SearchPicker'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

type Party = ListArea['party']

// Every row of the area's party collection (customers: sub-customers and inactive ones
// included; vendors: inactive ones included; no `where` on either), by display name; each
// typed piece must be in the name or the code (`searchPieces`: a piece holds no wildcard, so the
// server matches it as plain text). It runs only while the picker is open. With no search
// typed it lists the first PICKER_LIMIT names; a search lists every match, as the other
// Books pickers do.
function usePartyOptions(area: ListArea, term: string, isOpen: boolean) {
    const [partyCollection] = useStore(area.party.collection)
    const pieces = searchPieces(term)
    const query = useLiveQuery({
        query: q => {
            if (!isOpen) return undefined
            const from = q.from({ p: partyCollection })
            if (pieces.length === 0) {
                return from.orderBy(({ p }) => p.display_name).limit(PICKER_LIMIT)
            }
            return from
                .where(({ p }) =>
                    allOf(
                        pieces.map(piece =>
                            or(ilike(p.display_name, `%${piece}%`), ilike(p.code, `%${piece}%`))
                        )
                    )
                )
                .orderBy(({ p }) => p.display_name)
        },
        queryKey: [`${area.logContext}.${area.party.noun}-filter`, isOpen, ...pieces],
    })
    const options = (query.data ?? []).map(p => ({ id: p.id, label: p.display_name }))
    const isError = isOpen && query.isError
    return {
        options,
        isLoading: isOpen && !query.isReady && !query.isError,
        isError,
        recovery: isError
            ? { queries: [query.collection], sources: [partyCollection] }
            : NO_RECOVERY,
    }
}

// The chosen party's display name, read by its own query, so the trigger names it while
// the picker is closed. A party that is gone (deleted while chosen) is named so; the
// "All …" item then removes the filter.
function useChosenLabel(area: ListArea, partyId: string) {
    const [partyCollection] = useStore(area.party.collection)
    const hasParty = partyId !== ''
    const query = useLiveQuery({
        query: q => {
            if (!hasParty) return undefined
            return q
                .from({ p: partyCollection })
                .where(({ p }) => eq(p.id, partyId))
                .findOne()
        },
        queryKey: [`${area.logContext}.${area.party.noun}-filter-label`, partyId],
    })
    const isError = hasParty && query.isError
    const recovery: LiveRecovery = isError
        ? { queries: [query.collection], sources: [partyCollection] }
        : NO_RECOVERY
    return { label: chosenLabel(area.party, hasParty, query, isError), isError, recovery }
}

function chosenLabel(
    party: Party,
    hasParty: boolean,
    query: { data: { display_name: string } | undefined; isReady: boolean },
    isError: boolean
): string {
    if (!hasParty) return party.allLabel
    if (isError) return party.loadErrorText
    if (!query.isReady) return 'Loading…'
    return query.data?.display_name ?? party.notFoundText
}

interface DocumentPartyFilterProps {
    // The list's area: its party (customer or vendor), test-id prefix and log context.
    area: ListArea
    value: string
    // The chosen party's id, or '' for every party.
    onChange(partyId: string): void
}

/**
 * The list's party filter (spec docs/specs/sales-lists-design.md §3, purchase-lists §3
 * "Search and filters"): a search picker over every row of the area's party collection
 * (`area.party.collection`), whose first item, `area.party.allLabel`, removes the filter.
 * Its test ids start with `<prefix>-<party noun>`: the customer picker of Sales, the
 * vendor picker of Expenses; its search, empty, load error and not found texts are the
 * party's (`area.party`).
 * Its reads are its own: while they load the picker shows "Loading…", and when one fails
 * it shows "Could not load." with Retry, which restarts both. A reader has it too: a
 * filter is not a write. Its trigger has no type-to-open (`typeToOpen={false}`): a pick
 * gives the focus back to it, and the list's single-key shortcuts must still run there.
 */
export function DocumentPartyFilter({ area, value, onChange }: DocumentPartyFilterProps) {
    const picker = useSearchPicker()
    const parties = usePartyOptions(area, picker.debouncedTerm, picker.isOpen)
    const chosen = useChosenLabel(area, value)
    const { party } = area
    const stem = `${area.testIdPrefix}-${party.noun}`
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([parties.recovery, chosen.recovery]),
            onError: err => log.warn(area.logContext, 'retry failed', { err }),
        })
    }
    return (
        <SearchPicker
            picker={picker}
            title={party.label}
            triggerLabel={chosen.label}
            triggerAccessibilityLabel={party.label}
            triggerTestId={stem}
            disabled={false}
            searchPlaceholder={party.searchPlaceholder}
            searchTestId={`${stem}-search`}
            options={parties.options}
            optionTestIdPrefix={`${stem}-option`}
            value={value}
            onChange={onChange}
            noneOption={{ label: party.allLabel, testID: `${stem}-all` }}
            isLoading={parties.isLoading}
            loadFailed={parties.isError || chosen.isError}
            onRetry={retry}
            emptyText={party.emptyText}
            typeToOpen={false}
        />
    )
}
