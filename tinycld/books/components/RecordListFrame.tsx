import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useDetailSurface } from '../hooks/useDetailSurface'
import type { RecordListState } from '../hooks/useRecordList'
import {
    emptyKindFor,
    listWriteControls,
    type PartyListCopy,
    showsToolbar,
} from '../lib/party-list'
import { ListBanner } from './ListBanner'
import { ListEmptyState } from './ListEmptyState'
import { ListToolbar } from './ListToolbar'

export type RecordListFrameProps<Row> = {
    listPrefix: string
    recordPrefix: string
    copy: PartyListCopy
    list: RecordListState<Row>
    canWrite: boolean
    // The record the URL opens, or '' when none.
    openId: string
    onNew(): void
    onRetry(): void
    bannerMessage: string | null
    isLoadError: boolean
    onDismissBanner(): void
    // The row drawn as selected: the open record on the panel surface, else ''. Only the
    // table can sit beside the panel (cards show below 768 px, the panel at 1360 px).
    renderTable(selectedId: string): ReactNode
    renderCards(): ReactNode
    dialog: ReactNode
}

function BackLink({ testID, onPress }: { testID: string; onPress: () => void }) {
    const color = useThemeColor('muted-foreground')
    return (
        <Pressable
            testID={testID}
            accessibilityRole="link"
            onPress={onPress}
            className="flex-row items-center gap-1 self-start"
            style={{ minHeight: 28 }}
        >
            <ArrowLeft size={14} color={color} />
            <Text className="text-sm text-muted-foreground">All lists</Text>
        </Pressable>
    )
}

function NewButton({
    isVisible,
    testID,
    label,
    onPress,
}: {
    isVisible: boolean
    testID: string
    label: string
    onPress: () => void
}) {
    if (!isVisible) return null
    return (
        <Button testID={testID} size="sm" style={{ minHeight: 36 }} onPress={onPress}>
            <ButtonText>{label}</ButtonText>
        </Button>
    )
}

interface HeaderProps {
    listPrefix: string
    recordPrefix: string
    copy: PartyListCopy
    canWrite: boolean
    onBack: () => void
    onNew: () => void
}

function ListHeader({ listPrefix, recordPrefix, copy, canWrite, onBack, onNew }: HeaderProps) {
    const { showNewButton } = listWriteControls(canWrite)
    const newLabel = `New ${copy.singular}`
    return (
        <View className="gap-2 px-4 pb-3 pt-4">
            <BackLink testID={`${listPrefix}-back`} onPress={onBack} />
            <View className="flex-row items-center justify-between gap-3">
                {/* A long title wraps to two lines beside the New button on a phone (G8). */}
                <Text
                    testID={`${listPrefix}-title`}
                    className="min-w-0 shrink text-2xl font-semibold text-foreground"
                >
                    {copy.title}
                </Text>
                <NewButton
                    isVisible={showNewButton}
                    testID={`${recordPrefix}-new-header`}
                    label={newLabel}
                    onPress={onNew}
                />
            </View>
        </View>
    )
}

function LoadingBody({ isVisible, testID }: { isVisible: boolean; testID: string }) {
    if (!isVisible) return null
    return (
        <View testID={testID} className="flex-1">
            <LoadingState />
        </View>
    )
}

// The frame every Books list shares: the header with All lists and New, the toolbar, the
// banner, the loading and empty states, and the list's dialog. The list itself is the
// caller's table (wide screens) or cards (phones), drawn only once the records are ready.
export function RecordListFrame<Row>(props: RecordListFrameProps<Row>) {
    const { listPrefix, recordPrefix, copy, list, canWrite, openId } = props
    const orgHref = useOrgHref()
    const selectedId = useDetailSurface() === 'panel' ? openId : ''
    const isWide = useBreakpoint() !== 'mobile'
    const { viewState } = list
    const isReady = viewState === 'ready'
    const onRetry = props.isLoadError ? props.onRetry : undefined
    const onDismissBanner = props.isLoadError ? undefined : props.onDismissBanner
    const isLoading = viewState === 'loading'
    const showToolbar = showsToolbar(viewState)
    const emptyKind = emptyKindFor(viewState)
    const table = isReady && isWide ? props.renderTable(selectedId) : null
    const cards = isReady && !isWide ? props.renderCards() : null
    const showInactive = () => list.setShowInactive(true)
    // Pops back to the Lists hub this list was opened from; `navigate` would stack a second hub.
    const backToLists = () => router.dismissTo(orgHref('books/lists'))

    return (
        <View testID={`${listPrefix}-list`} className="min-w-0 flex-1 bg-background">
            <ListHeader
                listPrefix={listPrefix}
                recordPrefix={recordPrefix}
                copy={copy}
                canWrite={canWrite}
                onBack={backToLists}
                onNew={props.onNew}
            />
            <ListToolbar
                isVisible={showToolbar}
                testIdPrefix={listPrefix}
                placeholder={copy.searchPlaceholder}
                list={list}
                isWide={isWide}
            />
            <ListBanner
                testIdPrefix={listPrefix}
                message={props.bannerMessage}
                onRetry={onRetry}
                onDismiss={onDismissBanner}
            />
            <LoadingBody isVisible={isLoading} testID={`${listPrefix}-loading`} />
            <ListEmptyState
                kind={emptyKind}
                testIdPrefix={listPrefix}
                copy={copy}
                canWrite={canWrite}
                onNew={props.onNew}
                onClearSearch={list.clearSearch}
                onShowInactive={showInactive}
            />
            {table}
            {cards}
            {props.dialog}
        </View>
    )
}
