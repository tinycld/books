import { Pressable, Text, View } from 'react-native'
import { useOpenDocument } from '../../hooks/useOpenDocument'

const TAP = { minHeight: 44 }

// The kind whose read view a link opens (its `routeBase`).
type OpenKind = Parameters<typeof useOpenDocument>[0]

// One credit of the notice: its id and its whole line ("Credit memo 1001 · $250.00
// unapplied"), made by the screen's own text helper.
export type UnappliedCreditLine = { id: string; label: string }

interface CreditLinkProps {
    credit: UnappliedCreditLine
    openKind: OpenKind
    testID: string
}

// One credit: its line, a link that opens the credit (pushed, so Back returns to the form
// with what was typed).
function CreditLink({ credit, openKind, testID }: CreditLinkProps) {
    const open = useOpenDocument(openKind, credit.id)
    return (
        <Pressable
            testID={testID}
            accessibilityRole="link"
            onPress={open}
            className="justify-center self-start"
            style={TAP}
        >
            <Text className="text-sm text-primary underline">{credit.label}</Text>
        </Pressable>
    )
}

interface NoticeTitleProps {
    title: string | undefined
    testID: string
}

// The notice's title line, above its links; nothing when the screen gives none.
function NoticeTitle({ title, testID }: NoticeTitleProps) {
    if (title === undefined) return null
    return (
        <Text testID={testID} className="text-sm font-medium text-foreground">
            {title}
        </Text>
    )
}

interface UnappliedCreditsNoticeProps {
    // False with no credit to list.
    isVisible: boolean
    // The ids: `<prefix>-credits-notice` for the box, `<prefix>-credits-notice-title` for the
    // title, `<prefix>-credit-<id>` for each link.
    testIdPrefix: string
    // The line above the links ("Unapplied credit"); none draws no title line.
    title?: string
    // The credits, in the order to list them.
    credits: readonly UnappliedCreditLine[]
    // The credits' kind: each link opens that kind's read view.
    openKind: OpenKind
}

/**
 * A payment form's notice of the party's unapplied credits, above its open documents: an
 * optional title line, then one link row per credit, each opening the credit's read view.
 * Pay Bills lists its shown vendors' vendor credits, with no title (vendor credit spec
 * §3.10); Receive payment lists the chosen customer's credit memos under "Unapplied credit"
 * (apply credit spec §3.8). Nothing when there is none. The screen owns the read, its
 * loading state and its load error.
 */
export function UnappliedCreditsNotice({
    isVisible,
    testIdPrefix,
    title,
    credits,
    openKind,
}: UnappliedCreditsNoticeProps) {
    if (!isVisible) return null
    const links = credits.map(credit => (
        <CreditLink
            key={credit.id}
            credit={credit}
            openKind={openKind}
            testID={`${testIdPrefix}-credit-${credit.id}`}
        />
    ))
    return (
        <View
            testID={`${testIdPrefix}-credits-notice`}
            className="gap-1 rounded-xl border border-border bg-surface-secondary px-4 py-2"
        >
            <NoticeTitle title={title} testID={`${testIdPrefix}-credits-notice-title`} />
            {links}
        </View>
    )
}
