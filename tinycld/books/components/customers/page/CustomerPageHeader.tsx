import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { CustomerPageState } from '../../../hooks/useCustomerPage'
import { formatAddressLines, isCustomerAddress } from '../../../lib/address'
import type { DetailSurface } from '../../../lib/detail-surface'
import type { BooksCustomers } from '../../../types'
import { StatusBadge } from '../../StatusBadge'
import { CustomerContactActions } from './CustomerContactActions'
import { CustomerMoreMenu } from './CustomerMoreMenu'

const MAX_ADDRESS_LINES = 3

function BackLink({ isVisible, onPress }: { isVisible: boolean; onPress: () => void }) {
    if (!isVisible) return null
    return (
        <Pressable
            testID="customer-back"
            accessibilityRole="button"
            accessibilityLabel="Back to customers"
            onPress={onPress}
            className="-ml-1 min-h-11 justify-center self-start px-1"
        >
            <Text className="text-sm text-muted-foreground">‹ Customers</Text>
        </Pressable>
    )
}

function InactiveBadge({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <StatusBadge label="Inactive" tone="muted" testID="customer-inactive-badge" />
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

function NameRow({ record, trailing }: { record: BooksCustomers; trailing: ReactNode }) {
    return (
        <View className="min-w-0 flex-row items-center gap-1">
            <Text
                testID="customer-title"
                numberOfLines={2}
                className="shrink text-2xl font-semibold text-foreground"
            >
                {record.display_name}
            </Text>
            <CustomerContactActions record={record} />
            <InactiveBadge isVisible={record.inactive} />
            <View className="flex-1" />
            {trailing}
        </View>
    )
}

function Identity({ record, page }: { record: BooksCustomers; page: CustomerPageState }) {
    return (
        <>
            <Company record={record} />
            <Address record={record} />
            <ParentLine parentId={record.parent} onOpen={page.navigation.open} />
        </>
    )
}

interface CustomerPageHeaderProps {
    record: BooksCustomers
    surface: DetailSurface
    // The balance block and the actions, to the right on a wide window, under the
    // address on a phone.
    right: ReactNode
    page: CustomerPageState
}

/**
 * Who the customer is and how to reach them. On the page surface a "‹ Customers" back
 * button sits above the name; beside the list (a very wide window) there is none. On a
 * phone the header stacks, with More as an icon at the top right.
 */
export function CustomerPageHeader({ record, surface, right, page }: CustomerPageHeaderProps) {
    const isPhone = useBreakpoint() === 'mobile'
    const gutter = isPhone ? 'px-4' : 'px-6'
    const back = <BackLink isVisible={surface === 'page'} onPress={page.navigation.leave} />
    const more = <CustomerMoreMenu record={record} page={page} isPhone={isPhone} />
    if (isPhone) {
        return (
            <View testID="customer-header" className={`gap-3 pb-4 pt-2 ${gutter}`}>
                <View className="gap-1">
                    {back}
                    <NameRow record={record} trailing={more} />
                    <Identity record={record} page={page} />
                </View>
                {right}
            </View>
        )
    }
    return (
        <View testID="customer-header" className={`gap-1 pb-4 pt-2 ${gutter}`}>
            {back}
            <View className="flex-row items-start justify-between gap-6">
                <View className="min-w-0 flex-1 gap-1">
                    <NameRow record={record} trailing={null} />
                    <Identity record={record} page={page} />
                </View>
                <View className="items-end gap-4">
                    {right}
                    {more}
                </View>
            </View>
        </View>
    )
}
