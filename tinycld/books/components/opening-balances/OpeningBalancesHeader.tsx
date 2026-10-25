import { HelpIcon } from '@tinycld/core/components/help/HelpIcon'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ArrowLeft } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { useBackToChart } from '../../hooks/useBackToChart'

export interface OpeningStatusBadge {
    label: string
    tone: 'draft' | 'posted'
}

interface OpeningBalancesHeaderProps {
    title: string
    subtitle: { lead: string; tail: string }
    subtitleTestID?: string
    statusBadge?: OpeningStatusBadge
}

function StatusBadge({ badge }: { badge: OpeningStatusBadge | undefined }) {
    if (!badge) return null
    const tone =
        badge.tone === 'posted'
            ? 'border border-transparent bg-success/15'
            : 'border border-border bg-transparent'
    const text = badge.tone === 'posted' ? 'text-success' : 'text-muted-foreground'
    return (
        <View testID="opening-status-badge" className={`rounded-full px-2 py-0.5 ${tone}`}>
            <Text className={`text-xs font-medium ${text}`}>{badge.label}</Text>
        </View>
    )
}

function SubtitleTail({ tail }: { tail: string }) {
    if (tail === '') return null
    return (
        <Text numberOfLines={1} className="text-sm text-muted-foreground">
            {tail}
        </Text>
    )
}

function BackLink() {
    const onBack = useBackToChart()
    const color = useThemeColor('muted-foreground')
    return (
        <Pressable
            testID="opening-back"
            accessibilityRole="link"
            onPress={onBack}
            className="flex-row items-center gap-1 self-start"
            style={{ minHeight: 44 }}
        >
            <ArrowLeft size={16} color={color} />
            <Text className="text-sm text-muted-foreground">Chart of Accounts</Text>
        </Pressable>
    )
}

export function OpeningBalancesHeader({
    title,
    subtitle,
    subtitleTestID,
    statusBadge,
}: OpeningBalancesHeaderProps) {
    return (
        <View className="gap-1 border-b border-border px-4 pb-3 pt-2">
            <BackLink />
            <View className="flex-row items-center gap-2">
                <Text className="text-2xl font-semibold text-foreground">{title}</Text>
                <StatusBadge badge={statusBadge} />
                <View testID="opening-help">
                    <HelpIcon topic="books:opening-balances" />
                </View>
            </View>
            <View testID={subtitleTestID} className="flex-row flex-wrap">
                <Text className="text-sm text-muted-foreground">
                    {subtitle.tail === '' ? subtitle.lead : `${subtitle.lead} `}
                </Text>
                <SubtitleTail tail={subtitle.tail} />
            </View>
        </View>
    )
}
