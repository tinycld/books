// The tab parts both areas share: the chips and the base sort keys. Kept apart from
// document-list.ts, whose value imports reach the core logger (money.ts → warn-once.ts):
// sales-lists.ts and purchase-lists.ts are imported by the e2e helpers in Node, where the
// logger's @sentry/react-native cannot load.

import type { ListChip, ListSortKey } from './document-list'

// A chip's id is its label in lower case with dashes.
export function listChips(...labels: string[]): readonly ListChip[] {
    return labels.map(label => ({ id: label.toLowerCase().replace(/ /g, '-'), label }))
}

// Date, No. and the amount sort on every tab of both areas.
export const BASE_SORT_KEYS: readonly ListSortKey[] = ['date', 'number', 'amount']
