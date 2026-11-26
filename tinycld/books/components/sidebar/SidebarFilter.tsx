import { SidebarItem } from '@tinycld/core/components/sidebar-primitives'
import { type Shortcut, useRegisterShortcut } from '@tinycld/core/lib/shortcuts'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { PlainInput } from '@tinycld/core/ui/PlainInput'
import { Search, X } from 'lucide-react-native'
import { type RefObject, useMemo, useRef } from 'react'
import {
    Pressable,
    Text,
    type TextInputInstance,
    type TextInputKeyPressEvent,
    View,
} from 'react-native'
import { type FilterRow, useSidebarFilterRows } from '../../hooks/useSidebarFilterRows'
import { useBooksUIStore } from '../../stores/books-ui-store'

function ClearButton({ isVisible, onPress }: { isVisible: boolean; onPress: () => void }) {
    const color = useThemeColor('muted-foreground')
    if (!isVisible) return null
    return (
        <Pressable
            testID="books-sidebar-filter-clear"
            accessibilityRole="button"
            accessibilityLabel="Clear filter"
            onPress={onPress}
            hitSlop={12}
            className="items-center justify-center"
        >
            <X size={14} color={color} />
        </Pressable>
    )
}

function useFilterShortcut(inputRef: RefObject<TextInputInstance | null>) {
    const shortcut = useMemo<Shortcut>(
        () => ({
            id: 'books.sidebar.filter',
            keys: '$mod+/',
            scope: 'global',
            group: 'Books',
            description: 'Find in the Books menu',
            allowInInputs: true,
            run: () => inputRef.current?.focus(),
        }),
        [inputRef]
    )
    useRegisterShortcut(shortcut)
}

// The filter box at the top of the Books sidebar. While it holds text, the sidebar draws
// only the rows that match (SidebarFilterResults). Esc or the clear button empties it.
export function SidebarFilter() {
    const filter = useBooksUIStore(s => s.filter)
    const setFilter = useBooksUIStore(s => s.setFilter)
    const mutedColor = useThemeColor('muted-foreground')
    const inputRef = useRef<TextInputInstance>(null)
    useFilterShortcut(inputRef)

    const clear = () => setFilter('')
    const onKeyPress = (event: TextInputKeyPressEvent) => {
        if (event.nativeEvent.key !== 'Escape') return
        clear()
        inputRef.current?.blur()
    }

    return (
        <View className="mb-1 flex-row items-center gap-2 rounded-lg border border-border bg-background px-2.5">
            <Search size={14} color={mutedColor} />
            <PlainInput
                ref={inputRef}
                testID="books-sidebar-filter"
                accessibilityLabel="Find in the Books menu"
                placeholder="Find in menu"
                placeholderTextColor={mutedColor}
                value={filter}
                onChangeText={setFilter}
                onKeyPress={onKeyPress}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                className="flex-1 py-1.5 text-sm text-foreground"
            />
            <ClearButton isVisible={filter !== ''} onPress={clear} />
        </View>
    )
}

function NoMatches({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text
            testID="books-sidebar-filter-empty"
            className="px-3 py-2 text-sm text-muted-foreground"
        >
            No matches
        </Text>
    )
}

// The rows that match the filter, as one list. A press clears the filter, so the sidebar
// is whole again on the next visit.
export function SidebarFilterResults({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <FilterResultRows />
}

function FilterResultRows() {
    const { rows, isLoadingReports } = useSidebarFilterRows()
    const setFilter = useBooksUIStore(s => s.setFilter)
    const renderRow = (row: FilterRow) => (
        <SidebarItem
            key={row.key}
            label={row.label}
            icon={row.icon}
            badge={row.tag}
            isActive={row.isActive}
            closesDrawer
            onPress={() => {
                setFilter('')
                row.onPress()
            }}
            testID={row.testID}
        />
    )
    const items = rows.map(renderRow)
    return (
        <>
            {items}
            <NoMatches isVisible={rows.length === 0 && !isLoadingReports} />
        </>
    )
}
