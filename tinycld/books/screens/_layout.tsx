import { Stack } from 'expo-router'
import { View } from 'react-native'
import { NewFab } from '../components/NewFab'
import { CustomizeShortcutsDialog } from '../components/sidebar/CustomizeShortcutsDialog'

export default function BooksLayout() {
    return (
        <View className="flex-1">
            <Stack screenOptions={{ headerShown: false }} />
            <NewFab />
            <CustomizeShortcutsDialog />
        </View>
    )
}
