import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { usePanelTitle } from '@tinycld/core/reports/hooks/usePanelTitle'
import { readerTimeZone } from '@tinycld/core/reports/lib/date-time'
import { shortDay } from '@tinycld/core/reports/lib/dates'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { type RecordHistoryHeader, useRecordHistory } from '../../hooks/useRecordHistory'
import type { AuditLogRow } from '../../lib/audit-log'
import { HistoryEvent } from './HistoryEvent'

const TAP = { minHeight: 44 }

// The reader's day of an instant ("2026-11-14 03:00:00.000Z" is Nov 13 in Chicago).
function localDay(instant: string): string {
    const date = new Date(instant.replace(' ', 'T'))
    if (Number.isNaN(date.getTime())) return instant.slice(0, 10)
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: readerTimeZone(),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date)
    const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find(entry => entry.type === type)?.value ?? ''
    return `${part('year')}-${part('month')}-${part('day')}`
}

function deletedLine(deletedOn: string): string {
    return `This record was deleted on ${shortDay(localDay(deletedOn))}.`
}

// Open <record> while the record exists and the reader can open it; the deleted line
// once its live read answered with no record; nothing while that read loads.
function OpenRecord({ header }: { header: RecordHistoryHeader }) {
    const orgHref = useOrgHref()
    const { openHref, deletedOn } = header
    if (deletedOn) {
        return (
            <Text testID="history-deleted" className="text-sm text-muted-foreground">
                {deletedLine(deletedOn)}
            </Text>
        )
    }
    if (!openHref) return null
    // Always a push, even when the record's screen is right below in the Books stack: a
    // history opened from a report is watched by core (useRowLinks watchRecordReturn),
    // which shows the report again when the opened route leaves the stack, so a pop to
    // the record would land on the report instead.
    const open = () => router.push(orgHref(openHref))
    return (
        <View className="self-start">
            <Button testID="history-open" variant="outline" style={TAP} onPress={open}>
                <ButtonText>{header.openLabel}</ButtonText>
            </Button>
        </View>
    )
}

// The panel's own header shows the title (core D5, named through usePanelTitle), so only
// the screen draws it.
function HistoryTitle({ isVisible, title }: { isVisible: boolean; title: string }) {
    if (!isVisible) return null
    return (
        <Text testID="history-title" className="text-xl font-semibold text-foreground">
            {title}
        </Text>
    )
}

function SkeletonEvent() {
    return (
        <View className="gap-2 rounded-lg border border-border bg-card p-3">
            <View className="h-4 w-1/3 rounded bg-muted" />
            <View className="h-3 w-3/4 rounded bg-muted" />
            <View className="h-3 w-1/2 rounded bg-muted" />
        </View>
    )
}

function HistoryLoading() {
    return (
        <View testID="history-loading" className="gap-3">
            <SkeletonEvent />
            <SkeletonEvent />
            <SkeletonEvent />
        </View>
    )
}

function HistoryError({ onRetry }: { onRetry(): void }) {
    return (
        <View testID="history-error" accessibilityRole="alert" className="items-center gap-3 p-6">
            <Text className="text-base font-medium text-foreground">
                Could not load this record's history
            </Text>
            <Button testID="history-retry" variant="outline" style={TAP} onPress={onRetry}>
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

export function HistoryEmpty() {
    return (
        <View testID="history-empty" className="items-center p-6">
            <Text className="text-base text-muted-foreground">
                No changes recorded for this record.
            </Text>
        </View>
    )
}

function NoAccess() {
    return (
        <View testID="history-no-access" className="items-center p-6">
            <Text className="text-base font-medium text-foreground">
                You need Books access to see a record's history.
            </Text>
        </View>
    )
}

// A value's own read failed (a relation's name, a line's position): the events stay,
// with the history's error and Retry above them.
function ReadsError({ isVisible, onRetry }: { isVisible: boolean; onRetry(): void }) {
    if (!isVisible) return null
    return (
        <View
            testID="history-error"
            accessibilityRole="alert"
            className="flex-row flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
        >
            <Text className="text-sm text-foreground">
                Some names in this history could not be loaded
            </Text>
            <Button testID="history-retry" variant="outline" style={TAP} onPress={onRetry}>
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

interface ShowMoreProps {
    isVisible: boolean
    // The next 50 are being read: the button waits for them.
    isPending: boolean
    onPress(): void
}

function ShowMore({ isVisible, isPending, onPress }: ShowMoreProps) {
    if (!isVisible) return null
    const label = isPending ? 'Loading…' : 'Show 50 more'
    return (
        <Button
            testID="history-show-more"
            variant="outline"
            style={TAP}
            isDisabled={isPending}
            onPress={onPress}
        >
            <ButtonText>{label}</ButtonText>
        </Button>
    )
}

interface EventListProps {
    events: AuditLogRow[]
    collection: string
    currency: string
    history: string
    hasMore: boolean
    isLoadingMore: boolean
    readsFailed: boolean
    onShowMore(): void
    onRetry(): void
}

function EventList(props: EventListProps) {
    const { events, collection, currency, history } = props
    const items = events.map(row => (
        <HistoryEvent
            key={row.id}
            row={row}
            collection={collection}
            booksCurrency={currency}
            history={history}
        />
    ))
    return (
        <View testID="history-events" className="gap-3">
            <ReadsError isVisible={props.readsFailed} onRetry={props.onRetry} />
            {items}
            <ShowMore
                isVisible={props.hasMore}
                isPending={props.isLoadingMore}
                onPress={props.onShowMore}
            />
        </View>
    )
}

type HistoryView = 'loading' | 'error' | 'no-access' | 'empty' | 'events'

// The access read decides first (its own error shows the error state with its own
// retry), then the history's reads.
function useHistoryView(collection: string, id: string) {
    const access = useBooksAccess()
    const history = useRecordHistory(collection, id)
    const view: HistoryView = (() => {
        if (access.isError) return 'error'
        if (!access.isReady) return 'loading'
        if (!access.canRead) return 'no-access'
        if (history.isError) return 'error'
        if (history.isLoading) return 'loading'
        return history.events.length === 0 ? 'empty' : 'events'
    })()
    const retry = access.isError ? access.retry : history.retry
    return { view, retry, history }
}

interface RecordHistoryProps {
    collection: string
    id: string
    surface: 'screen' | 'panel'
}

/**
 * A record's history (spec §3 Record history): its type and name, Open or the deleted
 * line, then every event newest first, 50 at a time, live. Shared by the screen and the
 * report's side panel.
 */
export function RecordHistory({ collection, id, surface }: RecordHistoryProps) {
    const { view, retry, history } = useHistoryView(collection, id)
    // Names the record in the report panel's header; on the screen (outside core's
    // panel) the hook does nothing.
    usePanelTitle(history.header.title)
    if (view === 'no-access') return <NoAccess />
    const bodies: Record<Exclude<HistoryView, 'no-access'>, ReactNode> = {
        loading: <HistoryLoading />,
        error: <HistoryError onRetry={retry} />,
        empty: <HistoryEmpty />,
        events: (
            <EventList
                events={history.events}
                collection={collection}
                currency={history.currency}
                history={history.historyKey}
                hasMore={history.hasMore}
                isLoadingMore={history.isLoadingMore}
                readsFailed={history.readsFailed}
                onShowMore={history.showMore}
                onRetry={history.retry}
            />
        ),
    }
    const body = bodies[view]
    const isScreen = surface === 'screen'
    return (
        <ScrollView className="flex-1" contentContainerClassName="gap-3 px-4 py-3">
            <View className="gap-1">
                <Text testID="history-type" className="text-sm text-muted-foreground">
                    {history.header.typeWords}
                </Text>
                <HistoryTitle isVisible={isScreen} title={history.header.title} />
            </View>
            <OpenRecord header={history.header} />
            {body}
        </ScrollView>
    )
}
