import { LoadingState } from '@tinycld/core/components/LoadingState'
import { View } from 'react-native'
import { useDocumentKind } from './document-kind-context'

export function DocumentLoading() {
    const { doc } = useDocumentKind()
    const testID = `${doc.testId}-loading`
    return (
        <View testID={testID} className="flex-1 bg-background">
            <LoadingState />
        </View>
    )
}
