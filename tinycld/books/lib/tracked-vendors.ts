// The rows of the Settings → 1099s vendors card. Kept out of lib/form-1099.ts, which has
// no runtime imports.

import type { BooksVendors } from '../types'
import { taxIdLastFour } from './tax-id'

type TrackedVendorInput = Pick<
    BooksVendors,
    'id' | 'display_name' | 'legal_name' | 'tax_id' | 'inactive' | 'track_1099'
>

// `<` / `>` on the lower-cased names, not localeCompare, so the order is the same on
// every platform.
function compareTracked(a: TrackedVendorInput, b: TrackedVendorInput): number {
    const left = a.display_name.toLowerCase()
    const right = b.display_name.toLowerCase()
    if (left < right) return -1
    if (left > right) return 1
    if (a.id < b.id) return -1
    if (a.id > b.id) return 1
    return 0
}

function trackedDetail(vendor: TrackedVendorInput): string {
    const legalName = vendor.legal_name.trim()
    const parts = [
        legalName !== '' && legalName !== vendor.display_name ? legalName : '',
        vendor.inactive ? 'Inactive' : '',
    ]
    return parts.filter(part => part !== '').join(' · ')
}

export function trackedVendorRows(vendors: readonly TrackedVendorInput[]) {
    return vendors
        .filter(vendor => vendor.track_1099)
        .sort(compareTracked)
        .map(vendor => ({
            id: vendor.id,
            name: vendor.display_name,
            detail: trackedDetail(vendor),
            lastFour: taxIdLastFour(vendor.tax_id),
        }))
}

export type TrackedVendorRow = ReturnType<typeof trackedVendorRows>[number]

export function trackedVendorsSummary(rows: readonly TrackedVendorRow[]): string {
    const tracked = rows.length === 1 ? '1 vendor tracked' : `${rows.length} vendors tracked`
    const missing = rows.filter(row => row.lastFour === null).length
    if (missing === 0) return tracked
    return `${tracked} · ${missing} missing a tax ID`
}
