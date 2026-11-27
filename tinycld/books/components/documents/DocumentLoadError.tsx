import { Button, ButtonText } from '@tinycld/core/ui/button'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { EntryBackLink } from '../entries/EntryHeader'
import { DocumentKindContext, useDocumentKind } from './document-kind-context'
import type { DocumentKind } from './document-kinds'

const TAP = { minHeight: 44 }

interface LoadErrorPageProps {
    message: string
    onRetry(): void
    // The alert's test id; the Retry button's is `retryTestID`.
    testID: string
    retryTestID: string
    // The back link of a screen with its own list (the inventory adjustments); the
    // screen-stack back link (EntryBackLink) when undefined.
    backLink?: ReactNode
}

function PageBackLink({ backLink }: { backLink: ReactNode | undefined }) {
    if (backLink === undefined) return <EntryBackLink />
    return <>{backLink}</>
}

// A failed read of a record screen with Retry, kind-free: a document screen and a page that
// is no document kind (the write-off page) draw it with their own text and test ids.
export function LoadErrorPage({
    message,
    onRetry,
    testID,
    retryTestID,
    backLink,
}: LoadErrorPageProps) {
    return (
        <View className="flex-1 bg-background px-4 pt-2">
            <PageBackLink backLink={backLink} />
            <View
                testID={testID}
                accessibilityRole="alert"
                className="flex-1 items-center gap-3 p-6"
            >
                <Text className="text-base font-medium text-foreground">{message}</Text>
                <Button testID={retryTestID} variant="outline" style={TAP} onPress={onRetry}>
                    <ButtonText>Retry</ButtonText>
                </Button>
            </View>
        </View>
    )
}

// `message` names what failed: the document, or only a read its form needs (a sales
// receipt's deposit accounts).
export function DocumentLoadError({ message, onRetry }: { message: string; onRetry(): void }) {
    const { doc } = useDocumentKind()
    return (
        <LoadErrorPage
            message={message}
            onRetry={onRetry}
            testID={`${doc.testId}-error`}
            retryTestID={`${doc.testId}-retry`}
        />
    )
}

/**
 * A document route whose number-key read failed (useDocumentRouteId): the kind's load error
 * with Retry, in the place DocumentScreen would take, before the screen has a record id.
 * The root opts into pointer events and draws its background, as DocumentScreen's does.
 */
export function DocumentRouteLoadError({
    document: documentKind,
    onRetry,
}: {
    document: DocumentKind
    onRetry(): void
}) {
    const message = documentKind.doc.messages.loadFailed
    return (
        <DocumentKindContext.Provider value={documentKind}>
            <View pointerEvents="auto" className="flex-1 bg-background">
                <DocumentLoadError message={message} onRetry={onRetry} />
            </View>
        </DocumentKindContext.Provider>
    )
}
