import { type PickItem, PickMenu } from '@tinycld/core/ui/pick-menu'
import { Text, View } from 'react-native'
import type { PayBillsFormState } from '../../hooks/usePayBillsForm'
import { PayBillsVendorFilter } from './PayBillsVendorFilter'

const IDLE = { opacity: 0.5, pointerEvents: 'none' } as const

// Core PickMenu has no disabled state: while a Pay runs its chip takes no press (and a
// choice made through the keyboard does nothing), and it shows as idle.
function idleItems(items: PickItem[], isDisabled: boolean): PickItem[] {
    if (!isDisabled) return items
    return items.map(item => ({ ...item, onSelect: () => {} }))
}

interface FilterChipProps {
    testID: string
    purpose: string
    label: string
    items: PickItem[]
    isDisabled: boolean
    isVisible?: boolean
}

function FilterChip({
    testID,
    purpose,
    label,
    items,
    isDisabled,
    isVisible = true,
}: FilterChipProps) {
    if (!isVisible) return null
    const style = isDisabled ? IDLE : undefined
    return (
        <View style={style} aria-disabled={isDisabled}>
            <PickMenu
                testID={testID}
                purpose={purpose}
                label={label}
                size="touch"
                items={idleItems(items, isDisabled)}
            />
        </View>
    )
}

interface PayBillsFiltersProps {
    payForm: PayBillsFormState
    isDisabled: boolean
    // The cards have no sortable headers, so the sort is a chip there.
    isSortVisible: boolean
}

/**
 * The chip row above the list (spec §3.3): Vendor, Due ("Any time", "Overdue", "Due in 7
 * days"), at card width the sort (Due date or Vendor; the sorted one again reverses it),
 * and, at the right, the count of shown rows. Filters are screen state.
 */
export function PayBillsFilters({ payForm, isDisabled, isSortVisible }: PayBillsFiltersProps) {
    return (
        <View testID="pay-bills-filters" className="flex-row flex-wrap items-center gap-2">
            <PayBillsVendorFilter payForm={payForm} isDisabled={isDisabled} />
            <FilterChip
                testID="pay-bills-due-filter"
                purpose="Due"
                label={payForm.dueLabel}
                items={payForm.dueItems}
                isDisabled={isDisabled}
            />
            <FilterChip
                testID="pay-bills-sort"
                purpose="Sort"
                label={payForm.sortLabel}
                items={payForm.sortItems}
                isDisabled={isDisabled}
                isVisible={isSortVisible}
            />
            <Text testID="pay-bills-count" className="ml-auto text-sm text-muted-foreground">
                {payForm.openCountText}
            </Text>
        </View>
    )
}
