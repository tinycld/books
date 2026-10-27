import type { ReactNode } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
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
    // The open customer's row on the panel surface.
    isSelected: boolean
    menu: ReactNode
}

// Pads the header so it lines up with the rows; with the column minimums it stays inside
// the table's 540 px minimum width. A row puts the same left padding inside its open
// button (so the press area reaches the row's edge) and the right padding on the row.
export const CUSTOMER_ROW_CLASS = 'flex-row items-center pl-4 pr-2'

export function InactiveLabel({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Text className="ml-2 shrink-0 text-xs italic text-muted-foreground">Inactive</Text>
}

// The selected row: `aria-current` on web (a button has no valid `aria-selected`), the
// selected state on native, where VoiceOver and TalkBack announce it.
function selectedProps(isSelected: boolean) {
    if (Platform.OS === 'web') return { 'aria-current': isSelected ? ('true' as const) : undefined }
    return { accessibilityState: { selected: isSelected } }
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

// The row menu's cell, beside the open button. `menu` is null for a reader; the cell
// keeps its width so the columns line up.
export function CustomerMenuSlot({ menu }: { menu: ReactNode }) {
    return (
        <View className="items-center justify-center" style={CUSTOMER_COLUMNS.menu}>
            {menu}
        </View>
    )
}

// Two siblings in a row: the button that opens the customer (its cells) and the menu.
// Neither is inside the other, so each is its own control for a screen reader, and a
// press on the menu or one of its items never reaches the open button. A button takes
// Enter and Space on web.
export function CustomerRow({ row, onOpen, isSelected, menu }: CustomerRowProps) {
    const { customer, depth } = row
    const { id } = customer
    const dim = customer.inactive ? 'opacity-60' : ''
    const bg = isSelected ? 'bg-accent' : 'bg-background'
    return (
        <View
            testID={`customer-row-${id}`}
            className={`flex-row border-b border-border pr-2 ${bg} ${dim}`}
            style={{ height: CUSTOMER_ROW_HEIGHT, minHeight: 44 }}
        >
            <Pressable
                role="button"
                // No label: the platform reads the button's own text (name, company, email,
                // phone and the Inactive label), which a label would hide.
                {...selectedProps(isSelected)}
                onPress={() => onOpen(id)}
                className="min-w-0 flex-1 flex-row items-center pl-4"
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
            </Pressable>
            <CustomerMenuSlot menu={menu} />
        </View>
    )
}
