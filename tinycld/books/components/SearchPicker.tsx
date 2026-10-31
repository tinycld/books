import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useDebouncedValue } from '@tinycld/core/lib/use-debounced-value'
import { Menu } from '@tinycld/core/ui/menu'
import { PlainInput } from '@tinycld/core/ui/PlainInput'
import { ChevronDown } from 'lucide-react-native'
import { forwardRef, useState } from 'react'
import { Pressable, type PressableInstance, Text, View } from 'react-native'
import { SEARCH_DELAY_MS } from '../lib/list-search'

export type SearchPickerOption = { id: string; label: string }

const NO_OPTIONS: readonly SearchPickerOption[] = []

// Local, synchronous UI state that nothing else reads. Closing the menu clears the
// search, so the next open starts from the full list.
export function useSearchPicker() {
    const [isOpen, setIsOpen] = useState(false)
    const [term, setTerm] = useState('')
    const debouncedTerm = useDebouncedValue(term, SEARCH_DELAY_MS)
    const onOpenChange = (next: boolean) => {
        setIsOpen(next)
        if (!next) setTerm('')
    }
    return { isOpen, onOpenChange, term, setTerm, debouncedTerm }
}

interface TriggerProps {
    label: string
    accessibilityLabel: string
    testID: string
    isPlaceholder: boolean
    suffix?: string
    disabled: boolean
    onPress?: () => void
}

// A forwardRef around the Pressable: the menu measures its trigger through the ref.
const PickerTrigger = forwardRef<PressableInstance, TriggerProps>(function PickerTrigger(
    { label, accessibilityLabel, testID, isPlaceholder, suffix, disabled, onPress },
    ref
) {
    const chevron = useThemeColor('muted-foreground')
    const look = disabled ? 'opacity-60' : ''
    const labelTone = isPlaceholder ? 'text-muted-foreground' : 'text-foreground'
    return (
        <Pressable
            ref={ref}
            onPress={onPress}
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            disabled={disabled}
            className={`min-h-11 flex-row items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2.5 ${look}`}
        >
            <View className="min-w-0 flex-1 flex-row items-center gap-1">
                <Text numberOfLines={1} className={`shrink text-sm ${labelTone}`}>
                    {label}
                </Text>
                <TriggerSuffix text={suffix} />
            </View>
            <View className="shrink-0">
                <ChevronDown size={14} color={chevron} />
            </View>
        </Pressable>
    )
})

function TriggerSuffix({ text }: { text?: string }) {
    if (!text) return null
    return <Text className="shrink-0 text-sm text-muted-foreground">{text}</Text>
}

function NoneItem({
    option,
    value,
    onChange,
}: {
    option?: { label: string; testID: string }
    value: string
    onChange: (id: string) => void
}) {
    if (!option) return null
    return (
        <Menu.Item
            label={option.label}
            testID={option.testID}
            isSelected={value === ''}
            onSelect={() => onChange('')}
        />
    )
}

interface SearchPickerProps {
    picker: ReturnType<typeof useSearchPicker>
    title: string
    triggerLabel: string
    triggerAccessibilityLabel: string
    triggerTestId: string
    isPlaceholder?: boolean
    triggerSuffix?: string
    disabled: boolean
    searchPlaceholder: string
    searchTestId: string
    options: readonly SearchPickerOption[]
    optionTestIdPrefix: string
    value: string
    onChange: (id: string) => void
    // An item above the options that picks no record (an empty value).
    noneOption?: { label: string; testID: string }
}

/**
 * A searchable record picker: a menu with a search field, an optional "none" item,
 * then the options the caller found for `picker.debouncedTerm`. The caller runs the
 * search (today on the client: the pickers were written when pbtsdb could not push
 * `ilike`; pbtsdb 2.1.0 pushes it as PocketBase `~`). Escape closes the menu only (the
 * menu is its own layer).
 */
export function SearchPicker({
    picker,
    title,
    triggerLabel,
    triggerAccessibilityLabel,
    triggerTestId,
    isPlaceholder = false,
    triggerSuffix,
    disabled,
    searchPlaceholder,
    searchTestId,
    options,
    optionTestIdPrefix,
    value,
    onChange,
    noneOption,
}: SearchPickerProps) {
    const placeholderColor = useThemeColor('field-placeholder')
    // A core Sheet keeps its content mounted while it slides out, so items render only
    // while the menu is open (helix lesson 8), whatever the caller's query returns.
    const shown = picker.isOpen ? options : NO_OPTIONS
    const shownNone = picker.isOpen ? noneOption : undefined
    const items = shown.map(option => (
        <Menu.Item
            key={option.id}
            label={option.label}
            testID={`${optionTestIdPrefix}-${option.id}`}
            isSelected={option.id === value}
            onSelect={() => onChange(option.id)}
        />
    ))
    const trigger = (
        <PickerTrigger
            label={triggerLabel}
            accessibilityLabel={triggerAccessibilityLabel}
            testID={triggerTestId}
            isPlaceholder={isPlaceholder}
            suffix={triggerSuffix}
            disabled={disabled}
        />
    )
    return (
        <Menu
            trigger={trigger}
            isOpen={picker.isOpen}
            onOpenChange={picker.onOpenChange}
            title={title}
            width={320}
        >
            <Menu.Custom>
                <PlainInput
                    testID={searchTestId}
                    value={picker.term}
                    onChangeText={picker.setTerm}
                    placeholder={searchPlaceholder}
                    placeholderTextColor={placeholderColor}
                    accessibilityLabel={searchPlaceholder}
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
            </Menu.Custom>
            <NoneItem option={shownNone} value={value} onChange={onChange} />
            {items}
        </Menu>
    )
}
