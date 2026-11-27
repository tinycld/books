import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { ScrollView, Text, View } from 'react-native'
import type { AdjustmentRecordView } from '../../hooks/useAdjustmentRecord'
import { useOpenDocument } from '../../hooks/useOpenDocument'
import { useRecordNavigation } from '../../hooks/useRecordNavigation'
import { accountLabel } from '../../lib/account-options'
import { adjustmentTitle } from '../../lib/adjustment-kind'
import { adjustmentReadTotalText, noEntryText, readLineCells } from '../../lib/adjustment-read'
import { ADJUSTMENTS_PATH } from '../../lib/adjustment-route'
import { formatDay } from '../../lib/register-range'
import { DocumentHeader } from '../documents/DocumentHeader'
import { BackLink } from '../entries/EntryHeader'
import { TotalLine } from '../payments/PaymentTotals'
import { Detail, READ_BAND, Stamp, stampOf, TextLink } from '../payments/read-view-parts'
import { AdjustmentReadLines } from './AdjustmentReadLines'
import { BooksMadeNotice } from './BooksMadeNotice'

type Adjustment = NonNullable<AdjustmentRecordView['adjustment']>

// The route bases useOpenDocument opens: the replacing adjustment and the journal entry.
const ADJUSTMENT_LINK = { routeBase: ADJUSTMENTS_PATH }
const ENTRY_LINK = { routeBase: 'books/entries' }

function ReplacedLink({ replacement }: { replacement: Adjustment['replacement'] }) {
    const open = useOpenDocument(ADJUSTMENT_LINK, replacement?.id ?? '')
    if (!replacement) return null
    const text = `Replaced by inventory adjustment ${replacement.number}`
    return <TextLink text={text} onPress={open} testID="adjustment-replaced-by" />
}

function EntryLink({ adjustment }: { adjustment: Adjustment }) {
    const open = useOpenDocument(ENTRY_LINK, adjustment.entry)
    const noEntry = noEntryText(adjustment)
    if (noEntry !== null) {
        return (
            <Text testID="adjustment-no-entry" className="text-sm text-muted-foreground">
                {noEntry}
            </Text>
        )
    }
    if (adjustment.entry === '') return null
    return <TextLink text="View journal entry" onPress={open} testID="adjustment-entry" />
}

interface AdjustmentReadViewProps {
    adjustment: Adjustment
    lines: AdjustmentRecordView['lines']
    // Whether the book has a bin location: the Bin column shows only then.
    hasBins: boolean
    // The number of a re-cost's source document (useRecostSourceNumber).
    sourceNumber: string | undefined
}

/**
 * A stored inventory adjustment (inventory-adjust spec §3.5): the back link, the header
 * with its number and status (no figure), the notice of an adjustment Books made, the link
 * to the adjustment that replaced it, Date, Adjustment account and Memo, the lines with the
 * value Books posted for each (`posted_value`; "—" on a draft), Total value change (the
 * stored `value_change`; "—" on a draft), the stamps and the entry link or the no-entry
 * text. Links to another document open by useOpenDocument (pop when it is right below).
 */
export function AdjustmentReadView({
    adjustment,
    lines,
    hasBins,
    sourceNumber,
}: AdjustmentReadViewProps) {
    const isPhone = useBreakpoint() === 'mobile'
    const { leave } = useRecordNavigation(ADJUSTMENTS_PATH)
    const cells = readLineCells(lines, adjustment.status, adjustment.currency)
    const total = adjustmentReadTotalText(adjustment)
    const account = adjustment.accountRow ? accountLabel(adjustment.accountRow) : ''
    const date = formatDay(adjustment.date.slice(0, 10))
    const posted = stampOf('Posted', adjustment.postedByName, adjustment.posted_at)
    const voided = stampOf('Voided', adjustment.voidedByName, adjustment.voided_at)
    const totalStyle = { width: isPhone ? ('100%' as const) : 320 }
    return (
        <View testID="inventory-adjustment-read" className="min-w-0 flex-1 bg-background">
            <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-2 pb-6">
                <BackLink
                    label="Inventory adjustments"
                    testID="inventory-adjustment-back"
                    onPress={leave}
                />
                <DocumentHeader
                    title={adjustmentTitle(adjustment.number)}
                    status={adjustment.status}
                    isExpired={false}
                />
                <BooksMadeNotice adjustment={adjustment} sourceNumber={sourceNumber} />
                <ReplacedLink replacement={adjustment.replacement} />
                <View className={`${READ_BAND} flex-row flex-wrap gap-x-6 gap-y-3`}>
                    <Detail label="Date" value={date} testID="adjustment-read-date" />
                    <Detail
                        label="Adjustment account"
                        value={account}
                        testID="adjustment-read-account"
                    />
                    <Detail label="Memo" value={adjustment.memo} testID="adjustment-read-memo" />
                </View>
                <AdjustmentReadLines lines={cells} hasBins={hasBins} />
                <View className="gap-1 self-end" style={totalStyle}>
                    <TotalLine
                        label="Total value change"
                        amount={total}
                        isStrong
                        testID="adjustment-read-total"
                    />
                </View>
                <View className="gap-1">
                    <Stamp text={posted} testID="adjustment-read-posted" />
                    <Stamp text={voided} testID="adjustment-read-voided" />
                    <EntryLink adjustment={adjustment} />
                </View>
            </ScrollView>
        </View>
    )
}
