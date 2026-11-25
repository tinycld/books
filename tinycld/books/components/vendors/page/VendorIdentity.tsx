import { Text, View } from 'react-native'
import { formatAddressLines, isCustomerAddress } from '../../../lib/address'
import type { BooksVendors } from '../../../types'

const MAX_ADDRESS_LINES = 3

function Code({ record }: { record: BooksVendors }) {
    return (
        <Text
            testID="vendor-code"
            numberOfLines={1}
            className="text-sm tabular-nums text-muted-foreground"
        >
            {record.code}
        </Text>
    )
}

function Company({ record }: { record: BooksVendors }) {
    const company = record.company
    if (company === '' || company === record.display_name) return null
    return (
        <Text testID="vendor-company" numberOfLines={1} className="text-sm text-muted-foreground">
            {company}
        </Text>
    )
}

function Address({ record }: { record: BooksVendors }) {
    const address = isCustomerAddress(record.address) ? record.address : null
    const lines = formatAddressLines(address).slice(0, MAX_ADDRESS_LINES)
    if (lines.length === 0) return null
    // By position: two address lines may read the same.
    const items = lines.map((line, index) => (
        <Text key={index} numberOfLines={1} className="text-sm text-muted-foreground">
            {line}
        </Text>
    ))
    return <View testID="vendor-address">{items}</View>
}

/**
 * The vendor's lines under the name in the page header (its `identity` slot): the
 * company when it differs from the name, then the address on up to three lines. The
 * notes, account number, terms and payment service are in the Details and Notes tabs.
 */
export function VendorIdentity({ record }: { record: BooksVendors }) {
    return (
        <>
            <Code record={record} />
            <Company record={record} />
            <Address record={record} />
        </>
    )
}
