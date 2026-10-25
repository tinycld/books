import { SidebarItem } from '@tinycld/core/components/sidebar-primitives/SidebarItem'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ChevronRight } from 'lucide-react-native'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { SectionId } from '../../lib/settings-sections'

export interface SectionListItem {
    id: SectionId
    label: string
    summary: string
    isActive: boolean
}

interface SectionListProps {
    isVisible: boolean
    variant: 'rail' | 'rows'
    sections: SectionListItem[]
    onOpen: (id: SectionId) => void
}

function SectionRow({ item, onOpen }: { item: SectionListItem; onOpen: (id: SectionId) => void }) {
    const muted = useThemeColor('muted-foreground')
    return (
        <Pressable
            onPress={() => onOpen(item.id)}
            testID={`books-settings-section-${item.id}`}
            accessibilityRole="button"
            className="min-h-14 flex-row items-center gap-3 border-b border-border px-4 py-3"
        >
            <View className="flex-1 gap-0.5">
                <Text className="text-base font-semibold text-foreground">{item.label}</Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={2}>
                    {item.summary}
                </Text>
            </View>
            <ChevronRight size={18} color={muted} />
        </Pressable>
    )
}

export function SectionList({ isVisible, variant, sections, onOpen }: SectionListProps) {
    if (!isVisible) return null
    if (variant === 'rows') {
        const rows = sections.map(item => <SectionRow key={item.id} item={item} onOpen={onOpen} />)
        return (
            <ScrollView className="flex-1">
                <Text className="px-4 pb-2 pt-4 text-xl font-semibold text-foreground">
                    Settings
                </Text>
                {rows}
            </ScrollView>
        )
    }
    const items = sections.map(item => (
        <SidebarItem
            key={item.id}
            label={item.label}
            isActive={item.isActive}
            onPress={() => onOpen(item.id)}
            testID={`books-settings-section-${item.id}`}
        />
    ))
    return (
        <View className="w-60 gap-1 border-r border-border bg-surface-secondary p-3">{items}</View>
    )
}
