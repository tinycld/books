import { View } from 'react-native'
import { TAXES_LOAD_ERROR } from '../../lib/tax-messages'
import { ListBanner } from '../ListBanner'

interface DialogLoadErrorProps {
    isVisible: boolean
    testIdPrefix: string
    onRetry(): void
}

// A tax dialog or a record form's sales tax cell whose picker rows or edited record did
// not load: the error and its Retry stand where the picker would be.
export function DialogLoadError({ isVisible, testIdPrefix, onRetry }: DialogLoadErrorProps) {
    if (!isVisible) return null
    return (
        <View className="mb-3">
            <ListBanner
                testIdPrefix={testIdPrefix}
                message={TAXES_LOAD_ERROR}
                onRetry={onRetry}
                isFlush
            />
        </View>
    )
}
