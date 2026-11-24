import { describe, expect, it } from 'vitest'
import { NO_PREFERRED_VENDOR, preferredVendorLabel } from '../tinycld/books/lib/preferred-vendor'

const LOADED = { isLoading: false, isError: false }

describe('preferredVendorLabel', () => {
    it('reads "No preferred vendor" with no value, whatever the read says', () => {
        expect(NO_PREFERRED_VENDOR).toBe('No preferred vendor')
        expect(preferredVendorLabel('', { vendor: undefined, ...LOADED })).toEqual({
            label: 'No preferred vendor',
        })
        expect(
            preferredVendorLabel('', { vendor: undefined, isLoading: true, isError: false })
        ).toEqual({ label: 'No preferred vendor' })
    })

    it('names the chosen vendor', () => {
        const vendor = { display_name: 'Summit Supply', inactive: false }
        expect(preferredVendorLabel('v1', { vendor, ...LOADED })).toEqual({
            label: 'Summit Supply',
            suffix: undefined,
        })
    })

    it('marks a chosen vendor that is now inactive', () => {
        const vendor = { display_name: 'Old Mill', inactive: true }
        expect(preferredVendorLabel('v1', { vendor, ...LOADED })).toEqual({
            label: 'Old Mill',
            suffix: '(inactive)',
        })
    })

    it('shows an ellipsis while the chosen vendor loads', () => {
        expect(
            preferredVendorLabel('v1', { vendor: undefined, isLoading: true, isError: false })
        ).toEqual({ label: '…' })
    })

    it('reads "Unknown vendor" when the read failed or the vendor is gone', () => {
        expect(
            preferredVendorLabel('v1', { vendor: undefined, isLoading: false, isError: true })
        ).toEqual({ label: 'Unknown vendor' })
        expect(preferredVendorLabel('v1', { vendor: undefined, ...LOADED })).toEqual({
            label: 'Unknown vendor',
        })
    })
})
