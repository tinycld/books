import { HelpIcon } from '@tinycld/core/components/help/HelpIcon'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ArrowLeft } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { useBackToChart } from '../../hooks/useBackToChart'

interface OpeningBalancesHeaderProps {
    title: string
    subtitleLine: string
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

export function OpeningBalancesHeader({ title, subtitleLine }: OpeningBalancesHeaderProps) {
    return (
        <View className="gap-1 border-b border-border px-4 pb-3 pt-2">
            <BackLink />
            <View className="flex-row items-center gap-2">
                <Text className="text-2xl font-semibold text-foreground">{title}</Text>
                <View testID="opening-help">
                    <HelpIcon topic="books:opening-balances" />
                </View>
            </View>
            <Text className="text-sm text-muted-foreground">{subtitleLine}</Text>
        </View>
    )
}
