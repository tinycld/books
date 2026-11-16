import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { router, useLocalSearchParams } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { RecordHistory } from '../../../components/history/RecordHistory'

// Back to the screen the reader came from (the report or the record), else Books home.
function HistoryBackLink() {
    const color = useThemeColor('muted-foreground')
    const orgHref = useOrgHref()
    const onBack = () => {
        if (router.canGoBack()) {
            router.back()
            return
        }
        router.replace(orgHref('books'))
    }
    return (
        <Pressable
            testID="history-back"
            accessibilityRole="link"
            onPress={onBack}
            className="flex-row items-center gap-1 self-start"
            style={{ minHeight: 44 }}
        >
            <ArrowLeft size={16} color={color} />
            <Text className="text-sm text-muted-foreground">Back</Text>
        </Pressable>
    )
}

// A record's history as its own screen: below 1360 px from the report, and from a More
// menu (spec §3 Record history).
export default function RecordHistoryScreen() {
    const { collection, id } = useLocalSearchParams<{ collection: string; id: string }>()
    // A new record starts the history afresh (its page count is local state).
    const recordKey = `${collection}/${id}`
    return (
        <View testID="history-screen" className="flex-1 bg-background">
            <View className="border-b border-border px-4 pt-2 pb-2">
                <HistoryBackLink />
            </View>
            <View className="w-full flex-1" style={{ maxWidth: 820 }}>
                <RecordHistory key={recordKey} collection={collection} id={id} surface="screen" />
            </View>
        </View>
    )
}
