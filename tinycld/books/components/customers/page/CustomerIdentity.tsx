import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { Pressable, Text, View } from 'react-native'
import { formatAddressLines, isCustomerAddress } from '../../../lib/address'
import type { BooksCustomers } from '../../../types'

const MAX_ADDRESS_LINES = 3

function Code({ record }: { record: BooksCustomers }) {
    return (
        <Text
            testID="customer-code"
            numberOfLines={1}
            className="text-sm tabular-nums text-muted-foreground"
        >
            {record.code}
        </Text>
    )
}

function Company({ record }: { record: BooksCustomers }) {
    const company = record.company
    if (company === '' || company === record.display_name) return null
    return (
        <Text testID="customer-company" numberOfLines={1} className="text-sm text-muted-foreground">
            {company}
        </Text>
    )
}

function Address({ record }: { record: BooksCustomers }) {
    const address = isCustomerAddress(record.billing_address) ? record.billing_address : null
    const lines = formatAddressLines(address).slice(0, MAX_ADDRESS_LINES)
    if (lines.length === 0) return null
    // By position: two address lines may read the same.
    const items = lines.map((line, index) => (
        <Text key={index} numberOfLines={1} className="text-sm text-muted-foreground">
            {line}
        </Text>
    ))
    return <View testID="customer-address">{items}</View>
}

// "Sub-customer of <Parent>", a link that replaces this page with the parent's. While the
// parent loads, or when it cannot be read, the line names no parent and links nowhere.
function ParentLine({ parentId, onOpen }: { parentId: string; onOpen: (id: string) => void }) {
    const [customersCollection] = useStore('books_customers')
    const { record: parent } = useRecord(customersCollection, parentId)
    if (parentId === '') return null
    if (!parent) {
        return <Text className="text-sm text-muted-foreground">Sub-customer</Text>
    }
    const onPress = () => onOpen(parent.id)
    return (
        <Pressable
            testID="customer-parent-link"
            accessibilityRole="link"
            onPress={onPress}
            className="min-h-11 justify-center self-start"
        >
            <Text className="text-sm text-muted-foreground">
                {'Sub-customer of '}
                <Text className="text-sm font-medium text-primary">{parent.display_name}</Text>
            </Text>
        </Pressable>
    )
}

interface CustomerIdentityProps {
    record: BooksCustomers
    // Opens another customer's page in place of this one (the parent link).
    onOpenParent: (id: string) => void
}

/**
 * The customer's lines under the name in the page header (its `identity` slot): the
 * code, the company when it differs from the name, the billing address, and the parent line of a
 * sub-customer.
 */
export function CustomerIdentity({ record, onOpenParent }: CustomerIdentityProps) {
    return (
        <>
            <Code record={record} />
            <Company record={record} />
            <Address record={record} />
            <ParentLine parentId={record.parent} onOpen={onOpenParent} />
        </>
    )
}
