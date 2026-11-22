import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { type ComponentProps, useState } from 'react'
import { useController, useFormContext } from 'react-hook-form'
import { useClearStaleErrors } from '../../hooks/useClearStaleErrors'
import { useLinePartyOptions } from '../../hooks/useLinePartyOptions'
import type { EntryFormValues } from '../../lib/entry-schema'
import { parsePartyOptionId, partyOptionId } from '../../lib/line-party-options'
import { SearchPicker, useSearchPicker } from '../SearchPicker'

const EMPTY_TEXT = 'No active customers or vendors'

// A line's party: one customer or one vendor ('' for none), never both.
export type PartyValue = { customer: string; vendor: string }

const NO_PARTY: PartyValue = { customer: '', vendor: '' }

// The display name of a party: undefined while its row loads or when it names none. A
// party that became inactive still has its row, so its name reads.
function usePartyName({ customer, vendor }: PartyValue): string | undefined {
    const [customersCollection, vendorsCollection] = useStore('books_customers', 'books_vendors')
    const { record: customerRow } = useRecord(customersCollection, customer || undefined)
    const { record: vendorRow } = useRecord(vendorsCollection, vendor || undefined)
    return customer !== '' ? customerRow?.display_name : vendorRow?.display_name
}

/**
 * The party the line held when the picker mounted, with its name, so the option list
 * keeps it once even when it is no longer active (linePartyOptions `stored`). Its rows are
 * read only while the line holds another party; while it holds the mounted one, the
 * chosen name is that party's name.
 */
function useStoredParty(current: PartyValue, chosenName: string | undefined) {
    const [mounted] = useState(current)
    const isMountedValue =
        mounted.customer === current.customer && mounted.vendor === current.vendor
    const mountedName = usePartyName(isMountedValue ? NO_PARTY : mounted)
    const name = isMountedValue ? chosenName : mountedName
    return { ...mounted, display_name: name ?? '' }
}

type TriggerRef = ComponentProps<typeof SearchPicker>['triggerRef']

interface PartyPickerProps extends PartyValue {
    onChange: (party: PartyValue) => void
    // The picker's title, which also names the trigger to a screen reader
    // ("Line 2 name: Apex Retail").
    title: string
    // The trigger reads `<prefix>-<index>`, the search `<prefix>-search-<index>`, the none
    // item `<prefix>-none-<index>` and each option `<prefix>-option-<option id>`.
    testIdPrefix: string
    index: number
    disabled: boolean
    // The trigger's text while the line names no party.
    placeholder: string
    // The caller's ref on the trigger (a line's focus moves there from the cell before).
    triggerRef?: TriggerRef
}

/**
 * A line's customer or vendor, value-driven: one active customer or vendor in two groups,
 * searched by display name (useLinePartyOptions, read while the menu is open, with its
 * loading row and its error row with Retry). Choosing a customer clears the vendor and the
 * reverse; None clears both. A stored party that is now inactive shows by name and stays
 * in the options once, for the value the line mounted with.
 */
export function PartyPicker({
    customer,
    vendor,
    onChange,
    title,
    testIdPrefix,
    index,
    disabled,
    placeholder,
    triggerRef,
}: PartyPickerProps) {
    const picker = useSearchPicker()
    const isNone = customer === '' && vendor === ''
    const chosenName = usePartyName({ customer, vendor })
    const stored = useStoredParty({ customer, vendor }, chosenName)
    const parties = useLinePartyOptions(picker.debouncedTerm, picker.isOpen, stored)
    const label = isNone ? placeholder : (chosenName ?? '')

    const onPick = (optionId: string) => {
        const party = parsePartyOptionId(optionId)
        onChange({
            customer: party?.kind === 'customer' ? party.id : '',
            vendor: party?.kind === 'vendor' ? party.id : '',
        })
    }

    return (
        <SearchPicker
            picker={picker}
            title={title}
            triggerLabel={label}
            triggerAccessibilityLabel={`${title}: ${label}`}
            triggerTestId={`${testIdPrefix}-${index}`}
            triggerRef={triggerRef}
            isPlaceholder={isNone}
            disabled={disabled}
            searchPlaceholder="Search customers and vendors"
            searchTestId={`${testIdPrefix}-search-${index}`}
            options={parties.options}
            optionTestIdPrefix={`${testIdPrefix}-option`}
            value={partyOptionId({ customer, vendor })}
            onChange={onPick}
            noneOption={{ label: 'None', testID: `${testIdPrefix}-none-${index}` }}
            isLoading={parties.isLoading}
            loadFailed={parties.loadFailed}
            onRetry={parties.retry}
            emptyText={EMPTY_TEXT}
        />
    )
}

/**
 * A journal line's Name: PartyPicker bound to the entry form's `lines.<index>.customer`
 * and `.vendor`, with the `entry-line-name` ids.
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

    const onChange = (party: PartyValue) => {
        customerField.field.onChange(party.customer)
        vendorField.field.onChange(party.vendor)
        onEdit()
    }

    return (
        <PartyPicker
            customer={customerField.field.value ?? ''}
            vendor={vendorField.field.value ?? ''}
            onChange={onChange}
            title={`Line ${index + 1} name`}
            testIdPrefix="entry-line-name"
            index={index}
            disabled={false}
            placeholder="Name"
        />
    )
}
