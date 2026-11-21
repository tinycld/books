import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { Text, View } from 'react-native'
import type { PayeeRead } from '../../../hooks/useBankCategorize'
import { parsePartyOptionId } from '../../../lib/line-party-options'
import { SearchPicker } from '../../SearchPicker'

const NO_PAYEE = 'No payee'
const EMPTY_TEXT = 'No active customers or vendors'

// The chosen payee's name: '' while its row loads, "No payee" when none is chosen. A
// payee that became inactive still has its row, so its name shows.
function useChosenName(optionId: string) {
    const [customersCollection, vendorsCollection] = useStore('books_customers', 'books_vendors')
    const party = parsePartyOptionId(optionId)
    const customerId = party?.kind === 'customer' ? party.id : undefined
    const vendorId = party?.kind === 'vendor' ? party.id : undefined
    const { record: customerRow } = useRecord(customersCollection, customerId)
    const { record: vendorRow } = useRecord(vendorsCollection, vendorId)
    if (!party) return { label: NO_PAYEE, isPlaceholder: true }
    const name = customerId ? customerRow?.display_name : vendorRow?.display_name
    return { label: name ?? '', isPlaceholder: false }
}

// The Categorize way's Payee: one active customer or vendor, in the groups "Customers"
// and "Vendors" (useLinePartyOptions, the journal line's party read), or "No payee".
// `value` is a party option id ('customer:<id>', 'vendor:<id>') or ''. The read is the
// form's (`read`, useCategorizeForm), so a failed read also keeps Categorize disabled.
export function PayeePicker({
    read,
    value,
    onChange,
    isDisabled,
}: {
    read: PayeeRead
    value: string
    onChange: (optionId: string) => void
    isDisabled: boolean
}) {
    const { picker, parties } = read
    const chosen = useChosenName(value)
    return (
        <View className="gap-1.5">
            <Text className="text-sm font-semibold text-foreground">Payee</Text>
            <SearchPicker
                picker={picker}
                title="Payee"
                triggerLabel={chosen.label}
                triggerAccessibilityLabel={`Payee: ${chosen.label}`}
                triggerTestId="bank-cat-payee"
                isPlaceholder={chosen.isPlaceholder}
                disabled={isDisabled}
                searchPlaceholder="Search customers and vendors"
                searchTestId="bank-cat-payee-search"
                options={parties.options}
                optionTestIdPrefix="bank-cat-payee-option"
                value={value}
                onChange={onChange}
                noneOption={{ label: NO_PAYEE, testID: 'bank-cat-payee-none' }}
                isLoading={parties.isLoading}
                loadFailed={parties.loadFailed}
                onRetry={parties.retry}
                emptyText={EMPTY_TEXT}
            />
        </View>
    )
}
