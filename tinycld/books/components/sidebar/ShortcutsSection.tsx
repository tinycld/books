import { SidebarHeading, SidebarItem } from '@tinycld/core/components/sidebar-primitives'
import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { router } from 'expo-router'
import { Pencil } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { type OpenableList, useOpenRule } from '../../hooks/useOpenRule'
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

// Opens the Customize shortcuts dialog. Hidden until the list is read: the dialog edits
// a copy of the list, and there is none to copy before that.
function CustomizeButton({ list }: { list: OpenableList }) {
    const { canOpen, open } = useOpenRule(list)
    const setDrawerOpen = useWorkspaceStore(state => state.setDrawerOpen)
    const color = useThemeColor('muted-foreground')
    if (!canOpen) return null
    // On a phone the sidebar is in the drawer, which would stay over the page behind the
    // sheet; the dialog itself is drawn by the Books layout, so it stays.
    const onPress = () => {
        setDrawerOpen(false)
        open()
    }
    return (
        <Pressable
            testID="books-shortcuts-customize"
            accessibilityRole="button"
            accessibilityLabel="Customize shortcuts"
            onPress={onPress}
            hitSlop={12}
            className="items-center justify-center pt-3"
        >
            <Pencil size={14} color={color} />
        </Pressable>
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
    const { list, rows, isEmpty, isError, retry } = useShortcutRows()
    const items = rows.map(renderRow)
    return (
        <>
            <SidebarHeading action={<CustomizeButton list={list} />}>Shortcuts</SidebarHeading>
            {items}
            <ShortcutsNote isVisible={isEmpty} text="No shortcuts" />
            <ShortcutsError isVisible={isError} onRetry={retry} />
        </>
    )
}
