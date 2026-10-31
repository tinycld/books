import { describe, expect, it } from 'vitest'
import { trackedVendorRows, trackedVendorsSummary } from '../tinycld/books/lib/tracked-vendors'
import {
    TRACKED_VENDOR_IDS,
    UNTRACKED_VENDORS_1099,
    VENDORS_1099,
} from '../tinycld/books/lib/vendor-1099-fixture'

type VendorInput = Parameters<typeof trackedVendorRows>[0][number]

function vendor(id: string, displayName: string, values: Partial<VendorInput> = {}): VendorInput {
    return {
        id,
        display_name: displayName,
        legal_name: '',
        tax_id: '',
        inactive: false,
        track_1099: true,
        ...values,
    }
}

function rowOf(id: string) {
    const row = trackedVendorRows(VENDORS_1099).find(r => r.id === id)
    if (!row) throw new Error(`no tracked row for ${id}`)
    return row
}

describe('trackedVendorRows', () => {
    it('lists the tracked fixture vendors by display name', () => {
        expect(trackedVendorRows(VENDORS_1099).map(r => r.name)).toEqual([
            'Greenline Landscaping',
            'Jamal Okafor',
            'Keystone Legal Group',
            'Old Town Print Shop',
            'Willamette Valley Commercial Cleaning and Janitorial Services Cooperative',
        ])
    })

    it('sorts with case ignored, then by id', () => {
        const rows = trackedVendorRows([
            vendor('v3', 'Same'),
            vendor('v1', 'Bravo'),
            vendor('v4', 'Same'),
            vendor('v2', 'acme'),
        ])
        expect(rows.map(r => r.id)).toEqual(['v2', 'v1', 'v3', 'v4'])

        const reversed = trackedVendorRows([vendor('vb', 'Same'), vendor('va', 'Same')])
        expect(reversed.map(r => r.id)).toEqual(['va', 'vb'])
    })

    it('puts the legal name in the detail when it differs from the display name', () => {
        expect(rowOf(TRACKED_VENDOR_IDS.ssn).detail).toBe('Jamal A. Okafor')
        expect(rowOf(TRACKED_VENDOR_IDS.attorney)).toEqual({
            id: TRACKED_VENDOR_IDS.attorney,
            name: 'Keystone Legal Group',
            detail: 'Keystone Legal Group, P.C.',
            lastFour: '•••2741',
        })
    })

    it('has no last four and an empty detail for a vendor with no legal name or tax ID', () => {
        const greenline = rowOf(TRACKED_VENDOR_IDS.missingTaxId)
        expect(greenline.lastFour).toBeNull()
        expect(greenline.detail).toBe('')
    })

    it('marks an inactive vendor after its legal name', () => {
        expect(rowOf(TRACKED_VENDOR_IDS.inactive).detail).toBe('Old Town Print Shop LLC · Inactive')
        const [inactiveOnly] = trackedVendorRows([vendor('v1', 'Quiet Co', { inactive: true })])
        expect(inactiveOnly.detail).toBe('Inactive')
    })

    it('leaves the detail empty when the trimmed legal name equals the display name', () => {
        const [same] = trackedVendorRows([vendor('v1', 'Acme Co', { legal_name: 'Acme Co' })])
        expect(same.detail).toBe('')
        const [padded] = trackedVendorRows([vendor('v2', 'Acme Co', { legal_name: '  Acme Co  ' })])
        expect(padded.detail).toBe('')
        const [trimmed] = trackedVendorRows([
            vendor('v3', 'Acme', { legal_name: '  Acme Holdings LLC ' }),
        ])
        expect(trimmed.detail).toBe('Acme Holdings LLC')
    })

    it('leaves out a vendor that is not tracked', () => {
        const rows = trackedVendorRows([
            vendor('v1', 'Tracked Co'),
            vendor('v2', 'Untracked Co', { track_1099: false, tax_id: '12-3456789' }),
        ])
        expect(rows.map(r => r.id)).toEqual(['v1'])
        expect(trackedVendorRows(UNTRACKED_VENDORS_1099)).toEqual([])
    })
})

describe('trackedVendorsSummary', () => {
    it('counts the fixture vendors and the one missing a tax ID', () => {
        expect(trackedVendorsSummary(trackedVendorRows(VENDORS_1099))).toBe(
            '5 vendors tracked · 1 missing a tax ID'
        )
    })

    it('says 1 vendor tracked with no missing part when its tax ID is there', () => {
        const rows = trackedVendorRows([vendor('v1', 'Solo Co', { tax_id: '12-3456789' })])
        expect(trackedVendorsSummary(rows)).toBe('1 vendor tracked')
    })

    it('counts every vendor missing a tax ID', () => {
        const rows = trackedVendorRows([vendor('v1', 'One Co'), vendor('v2', 'Two Co')])
        expect(trackedVendorsSummary(rows)).toBe('2 vendors tracked · 2 missing a tax ID')
    })
})
