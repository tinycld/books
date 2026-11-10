import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useDebouncedValue } from '@tinycld/core/lib/use-debounced-value'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { PlainInput } from '@tinycld/core/ui/PlainInput'
import { ChevronDown } from 'lucide-react-native'
import { Fragment, forwardRef, useCallback, useRef, useState } from 'react'
import { Platform, Pressable, type PressableInstance, Text, View } from 'react-native'
import { SEARCH_DELAY_MS } from '../lib/list-search'

// `group` puts the option under a heading of that name; options of one group are
// consecutive in the list the caller passes.
export type SearchPickerOption = { id: string; label: string; group?: string }

const NO_OPTIONS: readonly SearchPickerOption[] = []

type OptionRun = { group: string | undefined; options: SearchPickerOption[] }

// Consecutive options of one group, in list order.
function groupRuns(options: readonly SearchPickerOption[]): OptionRun[] {
    const runs: OptionRun[] = []
    for (const option of options) {
        const last = runs[runs.length - 1]
        if (last && last.group === option.group) last.options.push(option)
        else runs.push({ group: option.group, options: [option] })
    }
    return runs
}

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
    onFocus?: () => void
    onBlur?: () => void
}

// Focuses the trigger the first time it attaches, on web only: on iOS and Android a
// focused field raises the soft keyboard over the form. A callback ref, so a re-render
// or a re-attach never moves focus again.
// `outer` is the caller's own ref on the trigger (a table cell's focus ref).
function useTriggerRef(autoFocus: boolean, outer: TriggerRef | undefined) {
    const pending = useRef(autoFocus && Platform.OS === 'web')
    return useCallback(
        (node: PressableInstance | null) => {
            outer?.(node)
            if (!node || !pending.current) return
            pending.current = false
            node.focus()
        },
        [outer]
    )
}

type TriggerRef = (node: PressableInstance | null) => void

// A forwardRef around the Pressable: the menu measures its trigger through the ref.
const PickerTrigger = forwardRef<PressableInstance, TriggerProps>(function PickerTrigger(
    {
        label,
        accessibilityLabel,
        testID,
        isPlaceholder,
        suffix,
        disabled,
        onPress,
        onFocus,
        onBlur,
    },
    ref
) {
    const chevron = useThemeColor('muted-foreground')
    const look = disabled ? 'opacity-60' : ''
    const labelTone = isPlaceholder ? 'text-muted-foreground' : 'text-foreground'
    return (
        <Pressable
            ref={ref}
            onPress={onPress}
            onFocus={onFocus}
            onBlur={onBlur}
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

interface OptionItemsProps {
    options: readonly SearchPickerOption[]
    optionTestIdPrefix: string
    value: string
    onChange: (id: string) => void
}

function OptionItems({ options, optionTestIdPrefix, value, onChange }: OptionItemsProps) {
    const items = options.map(option => (
        <Menu.Item
            key={option.id}
            label={option.label}
            testID={`${optionTestIdPrefix}-${option.id}`}
            isSelected={option.id === value}
            onSelect={() => onChange(option.id)}
        />
    ))
    return <>{items}</>
}

// The options, each group under its heading (a core menu section: muted, not pressable).
function GroupedOptions(props: OptionItemsProps) {
    const runs = groupRuns(props.options).map((run, index) => {
        const items = <OptionItems {...props} options={run.options} />
        if (run.group === undefined) return <Fragment key={`run-${index}`}>{items}</Fragment>
        return (
            <Menu.Section
                key={`run-${index}`}
                label={run.group}
                testID={`${props.optionTestIdPrefix}-group-${run.group}`}
            >
                {items}
            </Menu.Section>
        )
    })
    return <>{runs}</>
}

function StatusRow({ text, testID }: { text: string; testID: string }) {
    return (
        <Menu.Custom className="px-3 py-2">
            <Text testID={testID} className="text-sm text-muted-foreground">
                {text}
            </Text>
        </Menu.Custom>
    )
}

function RetryRow({ testID, onRetry }: { testID: string; onRetry?: () => void }) {
    return (
        <Menu.Custom className="px-3 py-2">
            <View
                testID={testID}
                accessibilityRole="alert"
                className="flex-row items-center justify-between gap-2"
            >
                <Text className="min-w-0 flex-1 text-sm text-danger">Could not load.</Text>
                <Button variant="outline" size="sm" style={{ minHeight: 44 }} onPress={onRetry}>
                    <ButtonText>Retry</ButtonText>
                </Button>
            </View>
        </Menu.Custom>
    )
}

type ListState = 'loading' | 'failed' | 'empty' | 'options'

function listStateOf({
    isLoading,
    loadFailed,
    hasOptions,
    emptyText,
}: {
    isLoading: boolean
    loadFailed: boolean
    hasOptions: boolean
    emptyText?: string
}): ListState {
    if (loadFailed) return 'failed'
    if (isLoading) return 'loading'
    if (!hasOptions && emptyText) return 'empty'
    return 'options'
}

interface OptionListProps extends OptionItemsProps {
    state: ListState
    emptyText?: string
    onRetry?: () => void
}

// What stands under the search field: the options, or the loading, error or empty row.
function OptionList({ state, emptyText, onRetry, ...items }: OptionListProps) {
    const prefix = items.optionTestIdPrefix
    if (state === 'failed') return <RetryRow testID={`${prefix}-retry`} onRetry={onRetry} />
    if (state === 'loading') return <StatusRow text="Loading…" testID={`${prefix}-loading`} />
    if (state === 'empty') return <StatusRow text={emptyText ?? ''} testID={`${prefix}-empty`} />
    return <GroupedOptions {...items} />
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
    // The options' query is loading: a "Loading…" row stands in for the options.
    isLoading?: boolean
    // The options' query failed: a "Could not load." row with Retry (onRetry) stands in
    // for the options.
    loadFailed?: boolean
    onRetry?: () => void
    // Shown when the options loaded and none matches.
    emptyText?: string
    // Focuses the trigger once when it mounts, on web only.
    autoFocus?: boolean
    // The caller's ref on the trigger, and its focus events (a table cell's focus ref and
    // row focus notes).
    triggerRef?: TriggerRef
    onTriggerFocus?: () => void
    onTriggerBlur?: () => void
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
    isLoading = false,
    loadFailed = false,
    onRetry,
    emptyText,
    autoFocus = false,
    triggerRef,
    onTriggerFocus,
    onTriggerBlur,
}: SearchPickerProps) {
    const triggerRefs = useTriggerRef(autoFocus && !disabled, triggerRef)
    const placeholderColor = useThemeColor('field-placeholder')
    // A core Sheet keeps its content mounted while it slides out, so items render only
    // while the menu is open (helix lesson 8), whatever the caller's query returns.
    const shown = picker.isOpen ? options : NO_OPTIONS
    const shownNone = picker.isOpen ? noneOption : undefined
    const state = picker.isOpen
        ? listStateOf({ isLoading, loadFailed, hasOptions: options.length > 0, emptyText })
        : 'options'
    const trigger = (
        <PickerTrigger
            ref={triggerRefs}
            onFocus={onTriggerFocus}
            onBlur={onTriggerBlur}
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
            <OptionList
                state={state}
                emptyText={emptyText}
                onRetry={onRetry}
                options={shown}
                optionTestIdPrefix={optionTestIdPrefix}
                value={value}
                onChange={onChange}
            />
        </Menu>
    )
}
