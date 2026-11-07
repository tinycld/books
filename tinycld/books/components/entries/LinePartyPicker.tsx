import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { useController, useFormContext } from 'react-hook-form'
import { useClearStaleErrors } from '../../hooks/useClearStaleErrors'
import { useLinePartyOptions } from '../../hooks/useLinePartyOptions'
import type { EntryFormValues } from '../../lib/entry-schema'
import { parsePartyOptionId, partyOptionId } from '../../lib/line-party-options'
import { SearchPicker, useSearchPicker } from '../SearchPicker'

const PLACEHOLDER = 'Name'
const EMPTY_TEXT = 'No active customers or vendors'

// The chosen party's display name: '' while its row loads, the placeholder when the
// line names none. A party that became inactive still has its row, so its name shows.
function useChosenName(customer: string, vendor: string) {
    const [customersCollection, vendorsCollection] = useStore('books_customers', 'books_vendors')
    const { record: customerRow } = useRecord(customersCollection, customer || undefined)
    const { record: vendorRow } = useRecord(vendorsCollection, vendor || undefined)
    if (customer === '' && vendor === '') return { label: PLACEHOLDER, isPlaceholder: true }
    const name = customer !== '' ? customerRow?.display_name : vendorRow?.display_name
    return { label: name ?? '', isPlaceholder: false }
}

/**
 * A journal line's Name: one active customer or vendor, in two groups, searched by
 * display name. Choosing a customer clears the vendor and the reverse; None clears both.
 */
export function LinePartyPicker({ index }: { index: number }) {
    const { control } = useFormContext<EntryFormValues>()
    const { onEdit } = useClearStaleErrors()
    const customerField = useController({
        control,
        name: `lines.${index}.customer`,
        defaultValue: '',
    })
    const vendorField = useController({ control, name: `lines.${index}.vendor`, defaultValue: '' })
    const customer = customerField.field.value ?? ''
    const vendor = vendorField.field.value ?? ''
    const picker = useSearchPicker()
    const parties = useLinePartyOptions(picker.debouncedTerm, picker.isOpen)
    const chosen = useChosenName(customer, vendor)

    const onChange = (optionId: string) => {
        const party = parsePartyOptionId(optionId)
        customerField.field.onChange(party?.kind === 'customer' ? party.id : '')
        vendorField.field.onChange(party?.kind === 'vendor' ? party.id : '')
        onEdit()
    }

    return (
        <SearchPicker
            picker={picker}
            title={`Line ${index + 1} name`}
            triggerLabel={chosen.label}
            triggerAccessibilityLabel={`Line ${index + 1} name: ${chosen.label}`}
            triggerTestId={`entry-line-name-${index}`}
            isPlaceholder={chosen.isPlaceholder}
            disabled={false}
            searchPlaceholder="Search customers and vendors"
            searchTestId={`entry-line-name-search-${index}`}
            options={parties.options}
            optionTestIdPrefix="entry-line-name-option"
            value={partyOptionId({ customer, vendor })}
            onChange={onChange}
            noneOption={{ label: 'None', testID: `entry-line-name-none-${index}` }}
            isLoading={parties.isLoading}
            loadFailed={parties.loadFailed}
            onRetry={parties.retry}
            emptyText={EMPTY_TEXT}
        />
    )
}
