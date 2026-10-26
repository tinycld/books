import { Pressable, Text, View } from 'react-native'
import type { CustomerRecord } from '../../hooks/useCustomersQuery'
import { CUSTOMER_INDENT, companyLine, isShownLine } from '../../lib/customer-display'
import type { CustomerListRow } from '../../lib/customer-tree'
import { InactiveLabel } from './CustomerRow'

interface CustomerCardProps {
    row: CustomerListRow<CustomerRecord>
    onOpen: (id: string) => void
    height: number
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
// spacers by.
export function CustomerCard({ row, onOpen, height }: CustomerCardProps) {
    const { customer, depth } = row
    const dim = customer.inactive ? 'opacity-60' : ''
    return (
        <Pressable
            testID={`customer-card-${customer.id}`}
            accessibilityRole="button"
            onPress={() => onOpen(customer.id)}
            className={`flex-row items-center border-b border-border bg-background pl-4 pr-2 ${dim}`}
            style={{ height }}
        >
            <View className="min-w-0 flex-1" style={{ paddingLeft: depth * CUSTOMER_INDENT }}>
                <View className="min-w-0 flex-row items-center">
                    <Text numberOfLines={1} className="shrink text-sm font-medium text-foreground">
                        {customer.display_name}
                    </Text>
                    <InactiveLabel isVisible={customer.inactive} />
                </View>
                <MutedLine value={companyLine(customer)} />
                <MutedLine value={customer.email} />
                <MutedLine value={customer.phone} />
            </View>
            <View style={{ width: 44 }} />
        </Pressable>
    )
}
