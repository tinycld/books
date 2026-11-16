import { type PickItem, PickMenu } from '@tinycld/core/ui/pick-menu'
import { Text, View } from 'react-native'
import type { PayBillsFormState } from '../../hooks/usePayBillsForm'
import { PayBillsVendorFilter } from './PayBillsVendorFilter'

// PickMenu names a chip "<purpose>: <label>", and the labels already start with "Due:"
// and "Sort:", so the purposes are other words ("Filter: Due: Any time").
const DUE_PURPOSE = 'Filter'
const SORT_PURPOSE = 'Order'

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
    return (
        <PickMenu
            testID={testID}
            purpose={purpose}
            label={label}
            size="touch"
            items={items}
            isDisabled={isDisabled}
        />
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
                purpose={DUE_PURPOSE}
                label={payForm.dueLabel}
                items={payForm.dueItems}
                isDisabled={isDisabled}
            />
            <FilterChip
                testID="pay-bills-sort"
                purpose={SORT_PURPOSE}
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
