import { LoadingState } from '@tinycld/core/components/LoadingState'
import { View } from 'react-native'
import { useDocumentKind } from './document-kind-context'

// The page-sized loading view of a record screen, kind-free: a document screen and a page
// that is no document kind (the write-off page) draw it with their own test id.
export function LoadingPage({ testID }: { testID: string }) {
    return (
        <View testID={testID} className="flex-1 bg-background">
            <LoadingState />
        </View>
    )
}

export function DocumentLoading() {
    const { doc } = useDocumentKind()
    return <LoadingPage testID={`${doc.testId}-loading`} />
}
