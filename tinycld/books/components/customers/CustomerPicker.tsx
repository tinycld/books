import { and, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useDebouncedValue } from '@tinycld/core/lib/use-debounced-value'
import { useRecord } from '@tinycld/core/lib/use-record'
import { Menu } from '@tinycld/core/ui/menu'
import { PlainInput } from '@tinycld/core/ui/PlainInput'
import { ChevronDown } from 'lucide-react-native'
import { forwardRef, useState } from 'react'
import { Pressable, Text, type View } from 'react-native'
import { PICKER_LIMIT, pickerOptions } from '../../lib/customer-tree'

const NONE_LABEL = 'None (top level)'
const SEARCH_DELAY_MS = 250

interface CustomerPickerProps {
    value: string
    onChange: (value: string) => void
    // The customer being edited, left out of its own options; empty for a new one.
    selfId: string
    disabled: boolean
}

// Active top-level customers, the only ones that can take a sub-customer. pbtsdb pushes
// only `like` to PocketBase, never `ilike`, so the name search runs on the client
// (`pickerOptions`), and the server limit applies only while not searching: a limit
// pushed during a search would cut matches before the filter sees them. One more
// than the limit, so the list is still full once the customer itself is left out.
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

interface TriggerProps {
    label: string
    disabled: boolean
    onPress?: () => void
}

// A forwardRef around the Pressable: the menu measures its trigger through the ref.
const PickerTrigger = forwardRef<View, TriggerProps>(function PickerTrigger(
    { label, disabled, onPress },
    ref
) {
    const chevron = useThemeColor('muted-foreground')
    const look = disabled ? 'opacity-60' : ''
    return (
        <Pressable
            ref={ref}
            onPress={onPress}
            testID="customer-parent"
            accessibilityRole="button"
            accessibilityLabel={`Parent customer: ${label}`}
            disabled={disabled}
            className={`min-h-11 flex-row items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2.5 ${look}`}
        >
            <Text numberOfLines={1} className="shrink text-sm text-foreground">
                {label}
            </Text>
            <ChevronDown size={14} color={chevron} />
        </Pressable>
    )
})

/**
 * The Parent customer picker: a searchable menu whose first item is "None (top
 * level)", then the active top-level customers other than this one, 50 at a time,
 * searched by display name. Escape closes the menu only (the menu is its own layer).
 */
export function CustomerPicker({ value, onChange, selfId, disabled }: CustomerPickerProps) {
    // Local, synchronous UI state that nothing else reads.
    const [isOpen, setIsOpen] = useState(false)
    const [term, setTerm] = useState('')
    const debouncedTerm = useDebouncedValue(term, SEARCH_DELAY_MS)
    const options = usePickerOptions(debouncedTerm, selfId, isOpen)
    const label = usePickerLabel(value)
    const placeholderColor = useThemeColor('field-placeholder')
    const onOpenChange = (next: boolean) => {
        setIsOpen(next)
        if (!next) setTerm('')
    }
    const items = options.map(option => (
        <Menu.Item
            key={option.id}
            label={option.display_name}
            testID={`customer-parent-option-${option.id}`}
            isSelected={option.id === value}
            onSelect={() => onChange(option.id)}
        />
    ))
    return (
        <Menu
            trigger={<PickerTrigger label={label} disabled={disabled} />}
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            title="Parent customer"
            width={320}
        >
            <Menu.Custom>
                <PlainInput
                    testID="customer-parent-search"
                    value={term}
                    onChangeText={setTerm}
                    placeholder="Search customers"
                    placeholderTextColor={placeholderColor}
                    accessibilityLabel="Search customers"
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
            </Menu.Custom>
            <Menu.Item
                label={NONE_LABEL}
                testID="customer-parent-none"
                isSelected={value === ''}
                onSelect={() => onChange('')}
            />
            {items}
        </Menu>
    )
}
