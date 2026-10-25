import { Text, View } from 'react-native'
import { formatMoney } from '../../lib/money'
import {
    dayLabel,
    type OpeningPreview as OpeningPreviewData,
    type PreviewSection,
} from '../../lib/opening-balances'

interface OpeningPreviewProps {
    preview: OpeningPreviewData
    date: string
    currency: string
    isBlocked: boolean
    problemMessage: string | null
}

function figureTone(cents: number) {
    return cents < 0 ? 'text-destructive' : 'text-foreground'
}

function PreviewChip() {
    return (
        <View className="rounded-full bg-accent px-2 py-0.5">
            <Text
                testID="opening-preview-chip"
                className="text-xs font-bold text-accent-foreground"
            >
                Preview
            </Text>
        </View>
    )
}

function Line({
    label,
    amount,
    amountClass,
    amountTestID,
    testID,
}: {
    label: string
    amount: string
    amountClass: string
    amountTestID?: string
    testID?: string
}) {
    return (
        <View testID={testID} className="flex-row items-baseline justify-between gap-3 py-1 pl-3">
            <Text className="min-w-0 flex-1 text-sm text-foreground">{label}</Text>
            <Text testID={amountTestID} className={`text-sm ${amountClass}`}>
                {amount}
            </Text>
        </View>
    )
}

function SectionView({
    section,
    currency,
    balancingId,
}: {
    section: PreviewSection
    currency: string
    balancingId: string | null
}) {
    const rows = section.rows.map(row => {
        const isBalancing = row.id === balancingId
        return (
            <Line
                key={row.id}
                testID={isBalancing ? 'opening-preview-obe' : `opening-preview-row-${row.id}`}
                label={row.label}
                amount={formatMoney(row.cents, currency)}
                amountClass={figureTone(row.cents)}
                amountTestID={isBalancing ? undefined : `opening-preview-amount-${row.id}`}
            />
        )
    })
    const isAssets = section.group === 'asset'
    return (
        <View className="mt-3">
            <Text className="border-b border-border pb-1 text-sm font-bold text-foreground">
                {section.title}
            </Text>
            {rows}
            <View className="flex-row items-baseline justify-between gap-3 py-1">
                <Text className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                    {`Total ${section.title.toLowerCase()}`}
                </Text>
                <Text
                    testID={isAssets ? 'opening-preview-total-assets' : undefined}
                    className={`text-sm font-semibold ${figureTone(section.total)}`}
                >
                    {formatMoney(section.total, currency)}
                </Text>
            </View>
        </View>
    )
}

function EmptyText({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="opening-preview-empty" className="pt-4 text-sm text-muted-foreground">
            Type a balance to see the preview.
        </Text>
    )
}

function PreviewContent({
    preview,
    currency,
    isVisible,
}: {
    preview: OpeningPreviewData
    currency: string
    isVisible: boolean
}) {
    if (!isVisible || preview.isEmpty) return null
    const balancingId = preview.balancingRow?.id ?? null
    const sections = preview.sections.map(section => (
        <SectionView
            key={section.group}
            section={section}
            currency={currency}
            balancingId={balancingId}
        />
    ))
    const isReconciled = preview.totalAssets === preview.totalLiabilitiesAndEquity
    return (
        <View>
            {sections}
            <View className="mt-3 flex-row items-baseline justify-between gap-3 border-t border-border pt-1">
                <Text className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                    Total liabilities and equity
                </Text>
                <Text
                    testID="opening-preview-total-le"
                    className={`text-sm font-semibold ${isReconciled ? 'text-success' : 'text-foreground'}`}
                >
                    {formatMoney(preview.totalLiabilitiesAndEquity, currency)}
                </Text>
            </View>
        </View>
    )
}

function Subtitle({ label }: { label: string }) {
    if (label === '') return null
    return (
        <Text testID="opening-preview-subtitle" className="text-xs text-muted-foreground">
            {`As of ${label}`}
        </Text>
    )
}

function Problem({ message }: { message: string | null }) {
    if (message === null) return null
    return (
        <Text
            testID="opening-preview-problem"
            className="pt-4 text-sm font-semibold text-destructive"
        >
            {message}
        </Text>
    )
}

export function OpeningPreview({
    preview,
    date,
    currency,
    isBlocked,
    problemMessage,
}: OpeningPreviewProps) {
    return (
        <View className="bg-surface-secondary p-4">
            <View className="flex-row items-center gap-2">
                <Text
                    testID="opening-preview-title"
                    className="text-base font-semibold text-foreground"
                >
                    Balance Sheet
                </Text>
                <PreviewChip />
            </View>
            <Subtitle label={dayLabel(date)} />
            <EmptyText isVisible={preview.isEmpty && !isBlocked} />
            <Problem message={isBlocked ? problemMessage : null} />
            <PreviewContent preview={preview} currency={currency} isVisible={!isBlocked} />
        </View>
    )
}
