import { Pressable, Text, View } from 'react-native'
import type { CustomerRecord } from '../../hooks/useCustomersQuery'
import {
    CUSTOMER_COLUMNS,
    CUSTOMER_INDENT,
    CUSTOMER_ROW_HEIGHT,
    companyLine,
} from '../../lib/customer-display'
import type { CustomerListRow } from '../../lib/customer-tree'

interface CustomerRowProps {
    row: CustomerListRow<CustomerRecord>
    onOpen: (id: string) => void
    // Read from checkpoint 6 on, when the panel surface marks the open customer's row.
    isSelected: boolean
}

// Pads the row so header and rows line up; with the column minimums it stays inside the
// table's 540 px minimum width.
export const CUSTOMER_ROW_CLASS = 'flex-row items-center pl-4 pr-2'

export function InactiveLabel({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Text className="ml-2 shrink-0 text-xs italic text-muted-foreground">Inactive</Text>
}

function CompanyText({ id, company }: { id: string; company: string }) {
    if (company === '') return null
    return (
        <Text
            testID={`customer-cell-company-${id}`}
            numberOfLines={1}
            className="text-xs text-muted-foreground"
        >
            {company}
        </Text>
    )
}

export function CustomerRow({ row, onOpen }: CustomerRowProps) {
    const { customer, depth } = row
    const { id } = customer
    const dim = customer.inactive ? 'opacity-60' : ''
    return (
        <Pressable
            testID={`customer-row-${id}`}
            accessibilityRole="button"
            onPress={() => onOpen(id)}
            className={`${CUSTOMER_ROW_CLASS} border-b border-border bg-background ${dim}`}
            style={{ height: CUSTOMER_ROW_HEIGHT, minHeight: 44 }}
        >
            <View
                testID={`customer-cell-name-${id}`}
                className="min-w-0 pr-3"
                style={CUSTOMER_COLUMNS.name}
            >
                {/* The indent sits inside the cell: padding on a flex-basis 0 cell would
                    widen it and push the Email column out of line with the header. */}
                <View className="min-w-0" style={{ paddingLeft: depth * CUSTOMER_INDENT }}>
                    <View className="min-w-0 flex-row items-center">
                        <Text numberOfLines={1} className="shrink text-sm text-foreground">
                            {customer.display_name}
                        </Text>
                        <InactiveLabel isVisible={customer.inactive} />
                    </View>
                    <CompanyText id={id} company={companyLine(customer)} />
                </View>
            </View>
            <View
                testID={`customer-cell-email-${id}`}
                className="min-w-0 pr-3"
                style={CUSTOMER_COLUMNS.email}
            >
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {customer.email}
                </Text>
            </View>
            <View testID={`customer-cell-phone-${id}`} style={CUSTOMER_COLUMNS.phone}>
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {customer.phone}
                </Text>
            </View>
            <View style={CUSTOMER_COLUMNS.menu} />
        </Pressable>
    )
}
