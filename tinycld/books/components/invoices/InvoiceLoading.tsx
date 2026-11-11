import { LoadingState } from '@tinycld/core/components/LoadingState'
import { View } from 'react-native'

export function InvoiceLoading() {
    return (
        <View testID="invoice-loading" className="flex-1 bg-background">
            <LoadingState />
        </View>
    )
}
