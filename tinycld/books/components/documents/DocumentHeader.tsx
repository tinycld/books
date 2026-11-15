import { HelpIcon } from '@tinycld/core/components/help/HelpIcon'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { Text, View } from 'react-native'
import { type DocumentStatus, type StatusTone, statusBadgeOf } from '../../lib/document-lifecycle'
import { StatusBadge } from '../StatusBadge'
import { useDocumentChrome } from './document-chrome'

interface DocumentHeaderProps {
    title: string
    // The document's status; a new posting form is a draft.
    status: DocumentStatus
    // The big figure's amount (the kind names it: Balance due on an invoice).
    figure: string
    // A saved estimate past its expiration date: a warning badge beside the status.
    isExpired: boolean
    // A badge that replaces the status's (an invoice's read view: Paid, Partly paid).
    badge?: HeaderBadgeView
}

type HeaderBadgeView = { label: string; tone: StatusTone }

function ExpiredBadge({ isVisible, testID }: { isVisible: boolean; testID: string }) {
    if (!isVisible) return null
    return <StatusBadge label="Expired" tone="warning" testID={testID} />
}

interface HeaderBadgeProps {
    status: DocumentStatus
    override: HeaderBadgeView | undefined
    testID: string
}

// The status in the kind's lifecycle's words and tone, unless the caller gives its own;
// nothing for a status the lifecycle does not have.
function HeaderBadge({ status, override, testID }: HeaderBadgeProps) {
    const doc = useDocumentChrome()
    const badge = override ?? statusBadgeOf(doc.lifecycle, status)
    if (!badge) return null
    return <StatusBadge label={badge.label} tone={badge.tone} testID={testID} />
}

// Title, badges and help at the left; the kind's big figure at the right (under the title
// on a phone).
export function DocumentHeader({ title, status, figure, isExpired, badge }: DocumentHeaderProps) {
    const doc = useDocumentChrome()
    const isPhone = useBreakpoint() === 'mobile'
    const layout = isPhone ? 'gap-2' : 'flex-row items-start justify-between gap-4'
    const figureClass = isPhone ? '' : 'items-end'
    const titleId = `${doc.testId}-title`
    const badgeId = `${doc.testId}-badge`
    const expiredId = `${doc.testId}-expired-badge`
    const figureId = `${doc.testId}-${doc.figure.testId}`
    return (
        <View className={layout}>
            <View className="flex-row flex-wrap items-center gap-2">
                <Text testID={titleId} className="text-xl font-semibold text-foreground">
                    {title}
                </Text>
                <HeaderBadge status={status} override={badge} testID={badgeId} />
                <ExpiredBadge isVisible={isExpired} testID={expiredId} />
                <HelpIcon topic={doc.helpTopic} />
            </View>
            <View className={figureClass}>
                <Text className="text-xs uppercase tracking-wide text-muted-foreground">
                    {doc.figure.label}
                </Text>
                <Text
                    testID={figureId}
                    className="text-2xl font-semibold text-foreground tabular-nums"
                >
                    {figure}
                </Text>
            </View>
        </View>
    )
}
