import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Text, View } from 'react-native'

export default function BooksSidebar() {
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')

    return (
        <View className="p-3 gap-2">
            <Text style={{ color: fg, fontSize: 14, fontWeight: '600' }}>Books</Text>
            <Text style={{ color: muted, fontSize: 12 }}>
                Chart of accounts and journal entries arrive with the ledger.
            </Text>
        </View>
    )
}
