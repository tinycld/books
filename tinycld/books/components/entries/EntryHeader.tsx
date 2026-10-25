import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Menu } from '@tinycld/core/ui/menu'
import { ArrowLeft, EllipsisVertical } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useBackToEntries } from '../../hooks/useBackToEntries'
import { TOO_LARGE_TEXT } from '../../lib/entry-lines'
import { formatMoney } from '../../lib/money'
import { useEntryLeave } from './EntryLeaveContext'

export function EntryBackLink() {
    const color = useThemeColor('muted-foreground')
    const { label, onBack } = useBackToEntries()
    const guardedLeave = useEntryLeave()
    return (
        <Pressable
            testID="entry-back"
            accessibilityRole="link"
            onPress={guardedLeave ?? onBack}
            className="flex-row items-center gap-1 self-start"
            style={{ minHeight: 44 }}
        >
            <ArrowLeft size={16} color={color} />
            <Text className="text-sm text-muted-foreground">{label}</Text>
        </Pressable>
    )
}

interface EntryHeaderMenuProps {
    isVisible: boolean
    onDeleteDraft(): void
}

// Drafts only; checkpoint 8 adds the posted entry's actions here.
export function EntryHeaderMenu({ isVisible, onDeleteDraft }: EntryHeaderMenuProps) {
    const color = useThemeColor('muted-foreground')
    if (!isVisible) return null
    return (
        <Menu
            title="Entry actions"
            placement="bottom-end"
            trigger={
                <Pressable
                    testID="entry-header-more"
                    accessibilityRole="button"
                    accessibilityLabel="Entry actions"
                    className="items-center justify-center"
                    style={{ width: 44, minHeight: 44 }}
                >
                    <EllipsisVertical size={18} color={color} />
                </Pressable>
            }
        >
            <Menu.Item label="Delete draft" isDestructive onSelect={onDeleteDraft} />
        </Menu>
    )
}

interface EntryHeaderProps {
    title: string
    badge: ReactNode
    bigTotal: number
    isTooLarge?: boolean
    currency: string
    menu?: ReactNode
}

export function EntryHeader({
    title,
    badge,
    bigTotal,
    isTooLarge = false,
    currency,
    menu,
}: EntryHeaderProps) {
    const totalText = isTooLarge ? TOO_LARGE_TEXT : formatMoney(bigTotal, currency)
    const isMobile = useBreakpoint() === 'mobile'
    // On a phone the menu shares the back link's row and the title row wraps, so a large
    // total drops below the title instead of overflowing. Wider screens keep one row.
    return (
        <View className="gap-1 border-b border-border px-4 pb-3 pt-2">
            <View className="flex-row items-center justify-between gap-3">
                <EntryBackLink />
                {isMobile ? menu : null}
            </View>
            <View className="flex-row items-center gap-3">
                <View className="min-w-0 flex-1 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <View className="min-w-0 shrink flex-row items-center gap-2">
                        <Text
                            testID="entry-title"
                            numberOfLines={1}
                            className="shrink text-xl font-semibold text-foreground"
                        >
                            {title}
                        </Text>
                        <View testID="entry-badge" className="shrink-0">
                            {badge}
                        </View>
                    </View>
                    <Text
                        testID="entry-big-total"
                        className="shrink-0 text-xl font-semibold text-foreground"
                    >
                        {totalText}
                    </Text>
                </View>
                {isMobile ? null : menu}
            </View>
        </View>
    )
}
