import { and, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { PICKER_LIMIT, pickerOptions } from '../../lib/customer-tree'
import { SearchPicker, useSearchPicker } from '../SearchPicker'

const NONE_LABEL = 'None (top level)'

interface CustomerPickerProps {
    value: string
    onChange: (value: string) => void
    // The customer being edited, left out of its own options; empty for a new one.
    selfId: string
    disabled: boolean
}

// Active top-level customers, the only ones that can take a sub-customer. The name
// search runs on the client (`pickerOptions`): it was written when pbtsdb could not push
// `ilike`, and pbtsdb 2.1.0 pushes it as PocketBase `~`, so it can move to the server
// later. The server limit applies only while not searching: a limit pushed during a
// search would cut matches before the filter sees them. One more than the limit, so
// the list is still full once the customer itself is left out.
function usePickerOptions(term: string, selfId: string, isOpen: boolean) {
    const [customersCollection] = useStore('books_customers')
    const isSearching = term.trim() !== ''
    const { data } = useLiveQuery({
        query: q => {
            if (!isOpen) return null
            const base = q
                .from({ c: customersCollection })
                .where(({ c }) => and(eq(c.parent, ''), eq(c.inactive, false)))
                .orderBy(({ c }) => c.display_name)
            return isSearching ? base : base.limit(PICKER_LIMIT + 1)
        },
        queryKey: ['books-customer-picker', isOpen, isSearching],
    })
    return pickerOptions(data ?? [], { term, selfId })
}

function usePickerLabel(value: string) {
    const [customersCollection] = useStore('books_customers')
    const { record } = useRecord(customersCollection, value)
    if (!value) return NONE_LABEL
    return record?.display_name ?? ''
}

/**
 * The Parent customer picker: a searchable menu whose first item is "None (top
 * level)", then the active top-level customers other than this one, 50 at a time,
 * searched by display name.
 */
export function CustomerPicker({ value, onChange, selfId, disabled }: CustomerPickerProps) {
    const picker = useSearchPicker()
    const options = usePickerOptions(picker.debouncedTerm, selfId, picker.isOpen)
    const label = usePickerLabel(value)
    const choices = options.map(o => ({ id: o.id, label: o.display_name }))
    return (
        <SearchPicker
            picker={picker}
            title="Parent customer"
            triggerLabel={label}
            triggerAccessibilityLabel={`Parent customer: ${label}`}
            triggerTestId="customer-parent"
            disabled={disabled}
            searchPlaceholder="Search customers"
            searchTestId="customer-parent-search"
            options={choices}
            optionTestIdPrefix="customer-parent-option"
            value={value}
            onChange={onChange}
            noneOption={{ label: NONE_LABEL, testID: 'customer-parent-none' }}
        />
    )
}
