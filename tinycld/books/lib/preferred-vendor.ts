import type { BooksVendors } from '../types'

export const NO_PREFERRED_VENDOR = 'No preferred vendor'

type ChosenVendor = Pick<BooksVendors, 'display_name' | 'inactive'>

interface ChosenVendorRead {
    vendor: ChosenVendor | undefined
    isLoading: boolean
    isError: boolean
}

/**
 * The Preferred vendor trigger's text and mark: "No preferred vendor" with no value; `…`
 * while the chosen vendor loads; "Unknown vendor" when its read failed or it no longer
 * exists (the id is kept); else its name, marked "(inactive)" when it is.
 */
export function preferredVendorLabel(
    id: string,
    { vendor, isLoading, isError }: ChosenVendorRead
): { label: string; suffix?: string } {
    if (id === '') return { label: NO_PREFERRED_VENDOR }
    if (isError) return { label: 'Unknown vendor' }
    if (vendor) {
        return { label: vendor.display_name, suffix: vendor.inactive ? '(inactive)' : undefined }
    }
    return { label: isLoading ? '…' : 'Unknown vendor' }
}
