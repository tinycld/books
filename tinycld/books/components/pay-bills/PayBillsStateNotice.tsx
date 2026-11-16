import { HelpIcon } from '@tinycld/core/components/help/HelpIcon'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import type { PayBillsScreenState } from '../../lib/pay-bills-screen-state'
import { useDocumentChrome } from '../documents/document-chrome'
import { EntryBackLink } from '../entries/EntryHeader'

export type PayBillsNoticeState = Exclude<PayBillsScreenState, { kind: 'ready' }>

const TAP = { minHeight: 44 }
const BAND = 'rounded-xl border border-border bg-surface-secondary p-4'
const SKELETON_ROWS = [0, 1, 2]

function SkeletonBar({ className }: { className: string }) {
    return <View className={`rounded bg-muted ${className}`} />
}

function SkeletonRow() {
    return (
        <View className="flex-row items-center gap-3 border-b border-border py-3">
            <SkeletonBar className="h-5 w-5" />
            <SkeletonBar className="h-4 flex-1" />
            <SkeletonBar className="h-4 w-24" />
            <SkeletonBar className="h-9 w-32" />
        </View>
    )
}

// The screen's title and help in every state: the user sees which screen failed or waits.
function NoticeTitle({ title }: { title: string }) {
    const doc = useDocumentChrome()
    return (
        <View className="flex-row flex-wrap items-center gap-2">
            <Text testID={`${doc.testId}-title`} className="text-xl font-semibold text-foreground">
                {title}
            </Text>
            <HelpIcon topic={doc.helpTopic} />
        </View>
    )
}

// The title, then a static skeleton of the figure, the band and three rows (spec §3.5
// States).
function PayBillsLoading({ title }: { title: string }) {
    const rows = SKELETON_ROWS.map(index => <SkeletonRow key={index} />)
    return (
        <View
            testID="pay-bills-loading"
            accessibilityLabel="Loading open bills"
            className="flex-1 gap-4 bg-background px-4 pt-2"
        >
            <EntryBackLink />
            <View className="flex-row items-center justify-between">
                <NoticeTitle title={title} />
                <SkeletonBar className="h-8 w-32" />
            </View>
            <View className={`${BAND} gap-3`}>
                <SkeletonBar className="h-10 w-full" />
            </View>
            {rows}
        </View>
    )
}

function RetryButton({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <Button testID="pay-bills-retry" variant="outline" style={TAP} onPress={onRetry}>
            <ButtonText>Retry</ButtonText>
        </Button>
    )
}

/**
 * Pay Bills' surfaces other than the form (spec §3.5): the loading skeleton, a failed read
 * with one Retry over every failed read, no write access, and on `?replaces` a payment
 * that does not exist or cannot be edited. One test id, `pay-bills-message`; its text
 * tells them apart. Each has the back link and the screen's title.
 */
export function PayBillsStateNotice({
    state,
    title,
    onRetry,
}: {
    state: PayBillsNoticeState
    title: string
    onRetry: () => void
}) {
    if (state.kind === 'loading') return <PayBillsLoading title={title} />
    const isError = state.kind === 'error'
    const role = isError ? 'alert' : undefined
    return (
        <View className="flex-1 gap-2 bg-background px-4 pt-2">
            <EntryBackLink />
            <NoticeTitle title={title} />
            <View
                testID="pay-bills-message"
                accessibilityRole={role}
                className="flex-1 items-center gap-3 p-6"
            >
                <Text className="text-base font-medium text-foreground">{state.message}</Text>
                <RetryButton isVisible={isError} onRetry={onRetry} />
            </View>
        </View>
    )
}
