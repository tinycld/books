import { LoadingState } from '@tinycld/core/components/LoadingState'
import { View } from 'react-native'

export function TransferLoading() {
    return (
        <View testID="transfer-loading" className="flex-1 bg-background">
            <LoadingState />
        </View>
    )
}
