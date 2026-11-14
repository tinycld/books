import { OrgLogo } from '@tinycld/core/components/OrgLogo'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { PublicEstimateView } from '../../hooks/usePublicEstimate'
import { usePublicPdfDownload } from '../../hooks/usePublicPdfDownload'
import {
    outcomeTextOf,
    PUBLIC_TEXTS,
    type PublicEstimateRow,
    publicDatesOf,
    publicHeadingOf,
} from '../../lib/estimate-public'
import { formatMoney } from '../../lib/money'
import { PublicCardSurface } from './PublicEstimateFrame'
import { PublicEstimateOutcome } from './PublicEstimateOutcome'

const TAP = { minHeight: 44 }

interface PublicEstimateCardProps {
    view: Extract<PublicEstimateView, { status: 'ready' }>
    // The customer's decision (checkpoint 3), drawn between the total and Download PDF.
    decision?: ReactNode
    refusal?: string
}

// Core OrgLogo draws an initials avatar when the deployment has no logo; the page shows
// a logo only when one is set.
function CardLogo() {
    const { org } = useOrgInfo()
    const logoUrl = org?.logoUrl ?? ''
    if (logoUrl === '') return null
    return (
        <View className="items-center">
            <OrgLogo org={org} size={48} />
        </View>
    )
}

function TotalBlock({ row }: { row: PublicEstimateRow }) {
    const heading = publicHeadingOf(row)
    const total = formatMoney(row.total, row.currency)
    const dates = publicDatesOf(row)
    return (
        <View className="items-center gap-1">
            <Text
                testID="estimate-public-heading"
                className="text-center text-sm text-muted-foreground"
            >
                {heading}
            </Text>
            <Text className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
                {PUBLIC_TEXTS.totalLabel}
            </Text>
            <Text
                testID="estimate-public-total"
                className="text-center text-3xl font-semibold text-foreground tabular-nums"
            >
                {total}
            </Text>
            <Text
                testID="estimate-public-dates"
                className="text-center text-sm text-muted-foreground"
            >
                {dates}
            </Text>
        </View>
    )
}

function CardMessage({ text }: { text: string }) {
    if (text.trim() === '') return null
    return (
        <Text
            testID="estimate-public-message"
            className="border-t border-border pt-4 text-sm text-foreground"
        >
            {text}
        </Text>
    )
}

function DownloadPdf({ token, number }: { token: string; number: string }) {
    const download = usePublicPdfDownload(token, number)
    return (
        <Button testID="estimate-public-pdf" variant="link" style={TAP} onPress={download}>
            <ButtonText>{PUBLIC_TEXTS.downloadPdf}</ButtonText>
        </Button>
    )
}

// The one card of the customer's page (spec §3.2, direction A): who sent it, the total,
// the dates, the message, the decision or the outcome, and the PDF.
export function PublicEstimateCard({ view, decision, refusal }: PublicEstimateCardProps) {
    const { row, outcome, business } = view
    const lines = outcomeTextOf(outcome, row, business)
    return (
        <PublicCardSurface testID="estimate-public">
            <CardLogo />
            <Text
                testID="estimate-public-business"
                accessibilityRole="header"
                className="text-center text-lg font-semibold text-foreground"
            >
                {business}
            </Text>
            <TotalBlock row={row} />
            <CardMessage text={row.message} />
            {decision}
            <PublicEstimateOutcome outcome={outcome} lines={lines} refusal={refusal} />
            <DownloadPdf token={row.token} number={row.number} />
        </PublicCardSurface>
    )
}
