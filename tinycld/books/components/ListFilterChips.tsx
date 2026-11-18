import { Pressable, ScrollView, Text, View } from 'react-native'

const SIZE_CLASS = {
    compact: 'px-3',
    touch: 'px-4',
} as const

const SIZE_STYLE = {
    compact: { minHeight: 36 },
    touch: { minHeight: 44 },
} as const

const NO_GROW = { flexGrow: 0 }

interface ListFilterChipProps {
    label: string
    isOn: boolean
    testID: string
    onPress(): void
    size: 'compact' | 'touch'
}

/** One filter chip of a list toolbar; a chosen chip draws filled and reports itself pressed. */
export function ListFilterChip({ label, isOn, testID, onPress, size }: ListFilterChipProps) {
    const box = isOn ? 'border-primary bg-primary' : 'border-border bg-background'
    const text = isOn ? 'text-primary-foreground' : 'text-foreground'
    return (
        <Pressable
            testID={testID}
            accessibilityRole="button"
            accessibilityState={{ selected: isOn }}
            // react-native-web draws `aria-pressed` from the aria prop only.
            aria-pressed={isOn}
            onPress={onPress}
            className={`items-center justify-center rounded-full border ${SIZE_CLASS[size]} ${box}`}
            style={SIZE_STYLE[size]}
        >
            <Text className={`text-sm ${text}`}>{label}</Text>
        </Pressable>
    )
}

interface ListFilterChipsProps {
    chips: readonly { id: string; label: string }[]
    selected: string
    testIdPrefix: string
    onSelect(id: string): void
    // In a row of their own that scrolls sideways (a phone); otherwise the chips are
    // siblings in the caller's wrapping row.
    scrolls: boolean
    // The scrolling row's side padding, inside the scroller so the chips scroll under it.
    gutterClass?: string
}

/** A list's status chips (one chosen at a time), each 44 px tall; ids `<testIdPrefix>-<chip id>`. */
export function ListFilterChips({
    chips,
    selected,
    testIdPrefix,
    onSelect,
    scrolls,
    gutterClass = '',
}: ListFilterChipsProps) {
    const items = chips.map(chip => (
        <ListFilterChip
            key={chip.id}
            label={chip.label}
            isOn={chip.id === selected}
            testID={`${testIdPrefix}-${chip.id}`}
            onPress={() => onSelect(chip.id)}
            size="touch"
        />
    ))
    if (!scrolls) return <>{items}</>
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={NO_GROW}>
            <View className={`flex-row items-center gap-2 ${gutterClass}`}>{items}</View>
        </ScrollView>
    )
}
