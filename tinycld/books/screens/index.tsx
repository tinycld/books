import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ScrollView, Text, View } from 'react-native'

export default function BooksIndex() {
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')

    return (
        <ScrollView className="flex-1 bg-background">
            <View className="p-6 gap-3">
                <Text style={{ color: fg, fontSize: 22, fontWeight: '600' }}>Books</Text>
                <Text style={{ color: muted, fontSize: 14 }}>
                    Chart of accounts and journal entries arrive with the ledger.
                </Text>
            </View>
        </ScrollView>
    )
}
