// The toolbar menus of a sales document list (the Sales lists design spec §3
// "Search and filters", "Sort"): the date-range items, the cards' Sort menu, and the
// header sort cycle. Pure, so each rule is unit-tested.

import {
    columnLabel,
    type DocumentListTab,
    LIST_COLUMNS,
    type ListRange,
    type ListSort,
    type ListSortKey,
} from './document-list'
import { RANGE_PRESETS } from './register-range'

// The presets of the register range, in their order, then All dates (the default).
export const RANGE_ITEMS: readonly { id: ListRange; label: string }[] = [
    ...RANGE_PRESETS,
    { id: 'all-dates', label: 'All dates' },
]

// A date column reads newest / oldest; No. and the amounts read high / low.
const DATE_SORT_KEYS: readonly ListSortKey[] = ['date', 'due', 'expires']

function directionLabels(key: ListSortKey, label: string): { down: string; up: string } {
    if (DATE_SORT_KEYS.includes(key)) {
        return { down: `${label}, newest first`, up: `${label}, oldest first` }
    }
    return { down: `${label}, high to low`, up: `${label}, low to high` }
}

// The cards' Sort menu: each sortable column of the tab in column order, descending then
// ascending, with ids `<sort key>-down` and `<sort key>-up`.
export function sortMenuItems(
    tab: DocumentListTab
): readonly { id: string; label: string; sort: ListSort }[] {
    return tab.columns.flatMap(column => {
        const key = LIST_COLUMNS[column].sortKey
        if (key === undefined || !tab.sortKeys.includes(key)) return []
        const { down, up } = directionLabels(key, columnLabel(tab, column))
        return [
            { id: `${key}-down`, label: down, sort: { key, isAscending: false } },
            { id: `${key}-up`, label: up, sort: { key, isAscending: true } },
        ]
    })
}

// A press on a header: a new column sorts ascending, the sorted column turns around.
export function nextSort(current: ListSort, key: ListSortKey): ListSort {
    if (current.key !== key) return { key, isAscending: true }
    return { key, isAscending: !current.isAscending }
}

export function ariaSortOf(sort: ListSort, key: ListSortKey): 'ascending' | 'descending' | 'none' {
    if (sort.key !== key) return 'none'
    return sort.isAscending ? 'ascending' : 'descending'
}
