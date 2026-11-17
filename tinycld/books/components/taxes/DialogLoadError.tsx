import { View } from 'react-native'
import { TAXES_LOAD_ERROR } from '../../lib/tax-messages'
import { ListBanner } from '../ListBanner'

interface DialogLoadErrorProps {
    isVisible: boolean
    testIdPrefix: string
    onRetry(): void
    // The failed read's words; the tax dialogs' by default.
    message?: string
    // The banner's box, for a dialog whose tests name it (`apply-credit-load-error`).
    testID?: string
}

// A dialog or a record form's sales tax cell whose rows or edited record did not load: the
// error and its Retry stand where the rows would be.
export function DialogLoadError({
    isVisible,
    testIdPrefix,
    onRetry,
    message = TAXES_LOAD_ERROR,
    testID,
}: DialogLoadErrorProps) {
    if (!isVisible) return null
    return (
        <View testID={testID} className="mb-3">
            <ListBanner testIdPrefix={testIdPrefix} message={message} onRetry={onRetry} isFlush />
        </View>
    )
}
