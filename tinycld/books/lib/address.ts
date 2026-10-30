import { z } from '@tinycld/core/ui/form'

// The parts of a stored address, the same list server/address.go checks
// (addressParts). A stored address is null or has exactly these keys.
export const ADDRESS_PARTS = ['line1', 'line2', 'city', 'region', 'postal_code', 'country'] as const

export type AddressPart = (typeof ADDRESS_PARTS)[number]

export type CustomerAddress = Record<AddressPart, string>

export const EMPTY_ADDRESS: CustomerAddress = {
    line1: '',
    line2: '',
    city: '',
    region: '',
    postal_code: '',
    country: '',
}

// 200 is the server's limit for each part.
const part = z.string().max(200)

export const addressPartsSchema = z.strictObject({
    line1: part,
    line2: part,
    city: part,
    region: part,
    postal_code: part,
    country: part,
})

export function isCustomerAddress(value: unknown): value is CustomerAddress {
    return addressPartsSchema.safeParse(value).success
}

// The lines an address prints as: street, street line 2, "City, Region
// Postal", country. Empty lines are dropped.
export function formatAddressLines(address: CustomerAddress | null): string[] {
    if (!address) return []
    const cityRegion = [address.city, address.region].filter(Boolean).join(', ')
    const cityLine = [cityRegion, address.postal_code].filter(Boolean).join(' ')
    return [address.line1, address.line2, cityLine, address.country].filter(Boolean)
}
