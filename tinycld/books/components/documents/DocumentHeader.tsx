import { HelpIcon } from '@tinycld/core/components/help/HelpIcon'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { type DocumentStatus, type StatusTone, statusBadgeOf } from '../../lib/document-lifecycle'
import { StatusBadge } from '../StatusBadge'
import { useDocumentChrome } from './document-chrome'

interface DocumentHeaderProps {
    title: string
    // The document's status; a new posting form is a draft.
    status: DocumentStatus
    // The big figure's amount; the kind names it (Balance due on an invoice and a bill,
    // since payments lower what is still owed). A kind with no figure (an inventory
    // adjustment) gives none.
    figure?: string
    // A saved estimate past its expiration date: a warning badge beside the status.
    isExpired: boolean
    // A badge that replaces the status's (an invoice's read view: Paid, Partly paid).
    badge?: HeaderBadgeView
    // A screen with no status of its own (Pay Bills: no draft, nothing stored yet) shows
    // no status badge.
    isBadgeHidden?: boolean
    // A line under the title and its badges (a sent document's sent line).
    subline?: ReactNode
}

type HeaderBadgeView = { label: string; tone: StatusTone }

function ExpiredBadge({ isVisible, testID }: { isVisible: boolean; testID: string }) {
    if (!isVisible) return null
    return <StatusBadge label="Expired" tone="warning" testID={testID} />
}

interface HeaderBadgeProps {
    status: DocumentStatus
    override: HeaderBadgeView | undefined
    isHidden: boolean
    testID: string
}

// The status in the kind's lifecycle's words and tone, unless the caller gives its own;
// nothing for a status the lifecycle does not have, or when the caller hides it.
function HeaderBadge({ status, override, isHidden, testID }: HeaderBadgeProps) {
    const doc = useDocumentChrome()
    const badge = override ?? statusBadgeOf(doc.lifecycle, status)
    if (isHidden || !badge) return null
    return <StatusBadge label={badge.label} tone={badge.tone} testID={testID} />
}

// The title row with a line under it. With no line the title row is drawn alone, so a
// screen that gives no subline (the forms, payments, deposits, bill payments, write-offs)
// keeps its layout.
function TitleBlock({ titleRow, subline }: { titleRow: ReactNode; subline: ReactNode }) {
    if (subline === undefined || subline === null) return titleRow
    return (
        <View className="min-w-0 shrink gap-1">
            {titleRow}
            {subline}
        </View>
    )
}

interface HeaderFigureProps {
    figure: { label: string; testId: string } | undefined
    amount: string | undefined
    className: string
    testID: string
}

// The kind's big figure; nothing for a kind that names none or a screen that gives no
// amount.
function HeaderFigure({ figure, amount, className, testID }: HeaderFigureProps) {
    if (!figure || amount === undefined) return null
    return (
        <View className={className}>
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">
                {figure.label}
            </Text>
            <Text testID={testID} className="text-2xl font-semibold text-foreground tabular-nums">
                {amount}
            </Text>
        </View>
    )
}

// Title, badges and help at the left; the kind's big figure at the right (under the title
// on a phone).
export function DocumentHeader({
    title,
    status,
    figure,
    isExpired,
    badge,
    isBadgeHidden = false,
    subline,
}: DocumentHeaderProps) {
    const doc = useDocumentChrome()
    const isPhone = useBreakpoint() === 'mobile'
    const layout = isPhone ? 'gap-2' : 'flex-row items-start justify-between gap-4'
    const figureClass = isPhone ? '' : 'items-end'
    const titleId = `${doc.testId}-title`
    const badgeId = `${doc.testId}-badge`
    const expiredId = `${doc.testId}-expired-badge`
    const figureId = `${doc.testId}-${doc.figure?.testId ?? 'figure'}`
    const titleRow = (
        <View className="flex-row flex-wrap items-center gap-2">
            <Text testID={titleId} className="text-xl font-semibold text-foreground">
                {title}
            </Text>
            <HeaderBadge
                status={status}
                override={badge}
                isHidden={isBadgeHidden}
                testID={badgeId}
            />
            <ExpiredBadge isVisible={isExpired} testID={expiredId} />
            <HelpIcon topic={doc.helpTopic} />
        </View>
    )
    return (
        <View className={layout}>
            <TitleBlock titleRow={titleRow} subline={subline} />
            <HeaderFigure
                figure={doc.figure}
                amount={figure}
                className={figureClass}
                testID={figureId}
            />
        </View>
    )
}
