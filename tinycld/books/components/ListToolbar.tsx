import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { PlainInput } from '@tinycld/core/ui/PlainInput'
import { Search } from 'lucide-react-native'
import { View } from 'react-native'
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
const WIDE_SEARCH_STYLE = { minHeight: 40, minWidth: 160, maxWidth: 360 }
const PHONE_SEARCH_STYLE = { minHeight: 40, minWidth: 0 }

// Typed on the search alone, so a toolbar without the Show inactive chip uses it too.
export function SearchField({
    testIdPrefix,
    placeholder,
    list,
    isWide,
}: {
    testIdPrefix: string
    placeholder: string
    list: { query: string; setQuery(text: string): void }
    isWide: boolean
}) {
    const color = useThemeColor('muted-foreground')
    return (
        <View
            className="flex-1 flex-row items-center gap-2 rounded-md border border-border bg-background px-3"
            style={isWide ? WIDE_SEARCH_STYLE : PHONE_SEARCH_STYLE}
        >
            <Search size={16} color={color} />
            <PlainInput
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
