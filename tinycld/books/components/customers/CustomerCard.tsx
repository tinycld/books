import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { CustomerRecord } from '../../hooks/useCustomersQuery'
import { CUSTOMER_INDENT, companyLine, isShownLine } from '../../lib/customer-display'
import type { CustomerListRow } from '../../lib/customer-tree'
import { CustomerMenuSlot, InactiveLabel } from './CustomerRow'

interface CustomerCardProps {
    row: CustomerListRow<CustomerRecord>
    onOpen: (id: string) => void
    height: number
    // The row menu, or null for a reader.
    menu: ReactNode
}

function MutedLine({ value }: { value: string | undefined }) {
    if (!isShownLine(value)) return null
    return (
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {value}
        </Text>
    )
}

// Drawn at exactly `height`, the customerCardHeight the windowed card list sizes its
// spacers by. Like a table row, the open button and the menu are siblings.
export function CustomerCard({ row, onOpen, height, menu }: CustomerCardProps) {
    const { customer, depth } = row
    const dim = customer.inactive ? 'opacity-60' : ''
    return (
        <View
            testID={`customer-card-${customer.id}`}
            className={`flex-row border-b border-border bg-background pr-2 ${dim}`}
            style={{ height }}
        >
            <Pressable
                role="button"
                onPress={() => onOpen(customer.id)}
                className="min-w-0 flex-1 justify-center pl-4"
            >
                <View className="min-w-0" style={{ paddingLeft: depth * CUSTOMER_INDENT }}>
                    <View className="min-w-0 flex-row items-center">
                        <Text
                            numberOfLines={1}
                            className="shrink text-sm font-medium text-foreground"
                        >
                            {customer.display_name}
                        </Text>
                        <InactiveLabel isVisible={customer.inactive} />
                    </View>
                    <MutedLine value={companyLine(customer)} />
                    <MutedLine value={customer.email} />
                    <MutedLine value={customer.phone} />
                </View>
            </Pressable>
            <CustomerMenuSlot menu={menu} />
        </View>
    )
}
