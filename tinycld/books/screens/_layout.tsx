import { Stack } from 'expo-router'
import { View } from 'react-native'
import { NewFab } from '../components/NewFab'

export default function BooksLayout() {
    return (
        <View className="flex-1">
            <Stack screenOptions={{ headerShown: false }} />
            <NewFab />
        </View>
    )
}
