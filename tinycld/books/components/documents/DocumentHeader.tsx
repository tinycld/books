import { HelpIcon } from '@tinycld/core/components/help/HelpIcon'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { Text, View } from 'react-native'
import type { DocumentRecord } from '../../hooks/document-data'
import { EntryStatusBadge } from '../entries/EntryStatusBadge'
import { useDocumentKind } from './document-kind-context'

type Status = DocumentRecord['status']

interface DocumentHeaderProps {
    title: string
    // The document's status; a new form is a draft.
    status: Status
    // The big figure's amount (the kind names it: Balance due on an invoice).
    figure: string
}

function StatusBadge({ status, testID }: { status: Status; testID: string }) {
    return (
        <View testID={testID}>
            <EntryStatusBadge status={status} />
        </View>
    )
}

// Title, badge and help at the left; the kind's big figure at the right (under the title
// on a phone).
export function DocumentHeader({ title, status, figure }: DocumentHeaderProps) {
    const { doc } = useDocumentKind()
    const isPhone = useBreakpoint() === 'mobile'
    const layout = isPhone ? 'gap-2' : 'flex-row items-start justify-between gap-4'
    const figureClass = isPhone ? '' : 'items-end'
    const titleId = `${doc.testId}-title`
    const badgeId = `${doc.testId}-badge`
    const figureId = `${doc.testId}-${doc.figure.testId}`
    return (
        <View className={layout}>
            <View className="flex-row flex-wrap items-center gap-2">
                <Text testID={titleId} className="text-xl font-semibold text-foreground">
                    {title}
                </Text>
                <StatusBadge status={status} testID={badgeId} />
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
