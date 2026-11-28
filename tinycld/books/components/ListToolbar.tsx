import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { PlainInput } from '@tinycld/core/ui/PlainInput'
import { Search } from 'lucide-react-native'
import type { ReactNode, RefObject } from 'react'
import { ScrollView, type TextInputInstance, type TextInputKeyPressEvent, View } from 'react-native'
import { ShowInactiveChip } from './ShowInactiveChip'

type ListFilters = {
    query: string
    setQuery(text: string): void
    showInactive: boolean
    setShowInactive(value: boolean): void
}

interface ListToolbarProps {
    isVisible: boolean
    testIdPrefix: string
    placeholder: string
    list: ListFilters
    isWide: boolean
}

// Wide, the field keeps a readable width beside the chip; on a phone it takes the row.
// `touch` is for a toolbar whose other controls are 44 px tall (chips, PickMenu `touch`),
// so the field lines up with them; `default` keeps the 40 px of the older list toolbars.
const SEARCH_STYLES = {
    default: {
        wide: { minHeight: 40, minWidth: 160, maxWidth: 360 },
        phone: { minHeight: 40, minWidth: 0 },
    },
    touch: {
        wide: { minHeight: 44, minWidth: 160, maxWidth: 360 },
        phone: { minHeight: 44, minWidth: 0 },
    },
}

// Typed on the search alone, so a toolbar without the Show inactive chip uses it too.
// `inputRef` is for a list whose keys focus the search (`/`): Escape in the field then
// blurs it, so the next key is the list's again (a key typed in the field stays text).
export function SearchField({
    testIdPrefix,
    placeholder,
    list,
    isWide,
    inputRef,
    size = 'default',
}: {
    testIdPrefix: string
    placeholder: string
    list: { query: string; setQuery(text: string): void }
    isWide: boolean
    inputRef?: RefObject<TextInputInstance | null>
    size?: 'default' | 'touch'
}) {
    const color = useThemeColor('muted-foreground')
    const onKeyPress = (event: TextInputKeyPressEvent) => {
        if (event.nativeEvent.key === 'Escape') inputRef?.current?.blur()
    }
    const keyPress = inputRef ? onKeyPress : undefined
    const styles = SEARCH_STYLES[size]
    const style = isWide ? styles.wide : styles.phone
    return (
        <View
            className="flex-1 flex-row items-center gap-2 rounded-md border border-border bg-background px-3"
            style={style}
        >
            <Search size={16} color={color} />
            <PlainInput
                ref={inputRef}
                onKeyPress={keyPress}
                testID={`${testIdPrefix}-search`}
                accessibilityLabel={placeholder}
                placeholder={placeholder}
                value={list.query}
                onChangeText={list.setQuery}
                className="min-w-0 flex-1 text-sm text-foreground"
            />
        </View>
    )
}

const NO_GROW = { flexGrow: 0 }

// `bottom` pads under the row only (a toolbar under a tab strip); `both` pads above and
// under it.
const CHIP_TOOLBAR_CLASSES = {
    bottom: { phone: 'gap-2 pb-3', wide: 'flex-row flex-wrap items-center gap-2 px-4 pb-3' },
    both: { phone: 'gap-2 py-2', wide: 'flex-row flex-wrap items-center gap-2 px-4 py-3' },
}

/**
 * The layout of a list toolbar with a search and filter chips. Wide, the search and the
 * chips share one wrapping row; on a phone the search has its own row and the chips scroll
 * sideways in the next.
 */
export function ChipToolbarLayout({
    search,
    chips,
    isPhone,
    padding,
}: {
    search: ReactNode
    chips: ReactNode
    isPhone: boolean
    padding: keyof typeof CHIP_TOOLBAR_CLASSES
}) {
    const classes = CHIP_TOOLBAR_CLASSES[padding]
    if (isPhone) {
        return (
            <View className={classes.phone}>
                <View className="flex-row items-center px-4">{search}</View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={NO_GROW}>
                    <View className="flex-row items-center gap-2 px-4">{chips}</View>
                </ScrollView>
            </View>
        )
    }
    return (
        <View className={classes.wide}>
            {search}
            {chips}
        </View>
    )
}

export function ListToolbar({
    isVisible,
    testIdPrefix,
    placeholder,
    list,
    isWide,
}: ListToolbarProps) {
    if (!isVisible) return null
    return (
        <View className="flex-row items-center gap-2 px-4 pb-3">
            <SearchField
                testIdPrefix={testIdPrefix}
                placeholder={placeholder}
                list={list}
                isWide={isWide}
            />
            <ShowInactiveChip
                testID={`${testIdPrefix}-show-inactive`}
                isOn={list.showInactive}
                onToggle={() => list.setShowInactive(!list.showInactive)}
            />
        </View>
    )
}
