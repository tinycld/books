import {
    newRecordPath,
    type OpenRecord,
    openRecordFromPath,
    type RecordRoute,
    recordPath,
} from './record-route'

// The inventory adjustments list and its records (inventory-adjust spec §2): the list at
// `books/inventory-adjustments`, an adjustment at `…/<id>`, the form at `…/new` with its
// query (`product`, `copy`, `replaces`, `fresh`).
export const ADJUSTMENTS_PATH = 'books/inventory-adjustments'

export function adjustmentPath(id: string): RecordRoute {
    return recordPath(ADJUSTMENTS_PATH, id)
}

export type NewAdjustmentQuery = {
    product?: string
    copy?: string
    replaces?: string
    fresh?: string
}

// A query key with no value is left out of the route.
export function newAdjustmentPath(query?: NewAdjustmentQuery): RecordRoute {
    const params = Object.fromEntries(
        Object.entries(query ?? {}).filter((entry): entry is [string, string] => !!entry[1])
    )
    if (Object.keys(params).length === 0) return newRecordPath(ADJUSTMENTS_PATH)
    return newRecordPath(ADJUSTMENTS_PATH, params)
}

export function openAdjustmentFromPath(pathname: string): OpenRecord {
    return openRecordFromPath(ADJUSTMENTS_PATH, pathname)
}
