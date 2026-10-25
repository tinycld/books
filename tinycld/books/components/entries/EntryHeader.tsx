import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ArrowLeft } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useBackToEntries } from '../../hooks/useBackToEntries'
import { TOO_LARGE_TEXT } from '../../lib/entry-lines'
import { formatMoney } from '../../lib/money'

export function EntryBackLink() {
    const color = useThemeColor('muted-foreground')
    const { label, onBack } = useBackToEntries()
    return (
        <Pressable
            testID="entry-back"
            accessibilityRole="link"
            onPress={onBack}
            className="flex-row items-center gap-1 self-start"
            style={{ minHeight: 44 }}
        >
            <ArrowLeft size={16} color={color} />
            <Text className="text-sm text-muted-foreground">{label}</Text>
        </Pressable>
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
    return (
        <View className="gap-1 border-b border-border px-4 pb-3 pt-2">
            <EntryBackLink />
            <View className="flex-row items-end justify-between gap-3">
                <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-2">
                    <Text testID="entry-title" className="text-2xl font-semibold text-foreground">
                        {title}
                    </Text>
                    <View testID="entry-badge">{badge}</View>
                </View>
                <Text testID="entry-big-total" className="text-2xl font-semibold text-foreground">
                    {totalText}
                </Text>
                {menu}
            </View>
        </View>
    )
}
