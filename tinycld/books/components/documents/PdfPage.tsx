import { LoadingState } from '@tinycld/core/components/LoadingState'
import { PdfCanvasViewer } from '@tinycld/core/file-viewer/previews/PdfCanvasViewer'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

const TAP = { minHeight: 44 }

// A letter-size page, as the reference draws it: the viewer scrolls inside it.
const PAGE = { width: '100%', maxWidth: 640, aspectRatio: 0.773 } as const
const PAGE_CLASS = 'self-center overflow-hidden rounded-md border border-border bg-background'

interface PdfPageProps {
    uri: string | null
    error: string | null
    onRetry: () => void
    // The page's own test id; its error, Retry and loading frames add `-error`, `-retry` and
    // `-loading`. Passed in, not read from a context: the page also draws inside a core
    // Dialog, whose overlay host drops the consumer's contexts on native.
    testId: string
}

/**
 * The page frame of a printed PDF: the viewer, or what stands in its place after a refusal
 * (the message with Retry) and while it loads (no uri and no error).
 */
export function PdfPage({ uri, error, onRetry, testId }: PdfPageProps) {
    if (error !== null) {
        const errorId = `${testId}-error`
        const retryId = `${testId}-retry`
        const errorClass = `${PAGE_CLASS} items-center justify-center gap-3 p-6`
        return (
            <View testID={errorId} accessibilityRole="alert" className={errorClass} style={PAGE}>
                <Text className="text-center text-base font-medium text-foreground">{error}</Text>
                <Button testID={retryId} variant="outline" style={TAP} onPress={onRetry}>
                    <ButtonText>Retry</ButtonText>
                </Button>
            </View>
        )
    }
    if (uri === null) {
        const loadingId = `${testId}-loading`
        return (
            <View testID={loadingId} className={PAGE_CLASS} style={PAGE}>
                <LoadingState />
            </View>
        )
    }
    return (
        <View testID={testId} className={PAGE_CLASS} style={PAGE}>
            <PdfCanvasViewer url={uri} />
        </View>
    )
}
