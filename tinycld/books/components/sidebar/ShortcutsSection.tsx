import { SidebarHeading, SidebarItem } from '@tinycld/core/components/sidebar-primitives'
import { router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { useShortcutRows } from '../../hooks/useShortcutRows'
import type { ShortcutRow } from '../../lib/shortcut-rows'

function ShortcutsNote({ isVisible, text }: { isVisible: boolean; text: string }) {
    if (!isVisible) return null
    return (
        <Text testID="books-shortcuts-empty" className="px-3 py-2 text-sm text-muted-foreground">
            {text}
        </Text>
    )
}

function ShortcutsError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View testID="books-shortcuts-error" className="flex-row items-center gap-2 px-3">
            <Text accessibilityRole="alert" className="flex-1 text-sm text-danger">
                Could not load your shortcuts
            </Text>
            <Pressable
                testID="books-shortcuts-retry"
                accessibilityRole="button"
                onPress={onRetry}
                className="justify-center px-2"
                style={{ minHeight: 44 }}
            >
                <Text className="text-sm font-medium text-primary">Retry</Text>
            </Pressable>
        </View>
    )
}

// A shortcut never shows the active highlight: the fixed navigation under it marks where
// the user is, and a second mark for the same screen would be noise.
function renderRow(row: ShortcutRow) {
    return (
        <SidebarItem
            key={row.key}
            label={row.label}
            icon={row.icon}
            closesDrawer
            onPress={() => router.navigate(row.href)}
            testID={row.testID}
        />
    )
}

// The first section of the Books sidebar: the user's own shortcuts, in the user's order.
export function ShortcutsSection() {
    const { rows, isEmpty, isError, retry } = useShortcutRows()
    const items = rows.map(renderRow)
    return (
        <>
            <SidebarHeading>Shortcuts</SidebarHeading>
            {items}
            <ShortcutsNote isVisible={isEmpty} text="No shortcuts" />
            <ShortcutsError isVisible={isError} onRetry={retry} />
        </>
    )
}
