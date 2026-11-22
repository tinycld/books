import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { CircleCheck } from 'lucide-react-native'
import { Text, View } from 'react-native'
import type { ReconcileScreenModel } from '../../hooks/useReconcileScreen'
import { formatMoney } from '../../lib/money'
import { countText, RECONCILE_TEXTS, reconciledCountText } from '../../lib/reconcile'
import { VIEW_REPORT_KEY } from '../../lib/reconcile-shortcuts'

const BLOCK_STYLE = { maxWidth: 520 }

function SummaryRow({
    label,
    value,
    isStrong = false,
}: {
    label: string
    value: string
    isStrong?: boolean
}) {
    const weight = isStrong ? 'font-semibold' : ''
    return (
        <View className="flex-row items-baseline justify-between gap-4 py-1.5">
            <Text className={`text-sm text-foreground ${weight}`}>{label}</Text>
            <Text className={`text-sm tabular-nums text-foreground ${weight}`}>{value}</Text>
        </View>
    )
}

function DifferenceRow({ value }: { value: string }) {
    const success = useThemeColor('success')
    return (
        <View className="mt-1 flex-row items-center justify-between gap-4 border-t border-border pt-3">
            <View className="flex-row items-center gap-2">
                <CircleCheck size={20} color={success} />
                <Text className="text-sm font-semibold text-foreground">
                    {RECONCILE_TEXTS.differenceBalanced}
                </Text>
            </View>
            <Text className="text-xl font-semibold tabular-nums text-foreground">{value}</Text>
        </View>
    )
}

// View report, key R in the screen's `list` scope; drawn only while the reader has the
// Reconciliation Report (`reportHref`). On a phone it takes the full width.
function ViewReportButton({
    model,
    isVisible,
}: {
    model: ReconcileScreenModel
    isVisible: boolean
}) {
    if (!isVisible) return null
    const width = model.isWide ? 'min-h-11' : 'min-h-11 w-full'
    return (
        <ShortcutButton
            testID="reconcile-view-report"
            label={RECONCILE_TEXTS.viewReport}
            shortcut={VIEW_REPORT_KEY}
            onPress={model.onViewReport}
            className={width}
            scopeOwner={model.scopeOwner}
        />
    )
}

/**
 * The finished summary of `books/reconcile/<id>` (reconcile spec §3 "The finished
 * summary"): the block `reconcile-finished` from the stamped fields (the model's totals are
 * stampedTotals: the beginning balance, each side's sum and count, the cleared balance by
 * reconcileTotals' formula and the difference), "Finished <day> by <name>", the line with
 * the count of reconciled transactions, and the buttons View report (the Reconciliation
 * Report with this statement, reconciliation report spec §3), Reconcile another account
 * (back to `books/reconcile`) and View register (`books/accounts/<accountId>`).
 */
export function ReconcileFinished({ model }: { model: ReconcileScreenModel }) {
    const { reconciliation, totals, words, currency } = model
    if (model.state !== 'finished' || !reconciliation || !totals) return null
    const money = (cents: number) => formatMoney(cents, currency)
    const outLabel = `${words.outOperator} ${countText(totals.outCount, words.outOne, words.outMany)}`
    const inLabel = `${words.inOperator} ${countText(totals.inCount, words.inOne, words.inMany)}`
    const statementText = money(reconciliation.statement_balance)
    const beginningText = money(totals.beginning)
    const outText = money(totals.clearedOut)
    const inText = money(totals.clearedIn)
    const clearedText = money(totals.clearedBalance)
    const differenceText = money(totals.difference)
    const countLine = reconciledCountText(totals.outCount + totals.inCount)
    const buttons = model.isWide ? 'flex-row items-center gap-3' : 'gap-3'
    return (
        <View className="gap-4">
            <View
                testID="reconcile-finished"
                className="w-full self-start rounded-xl border border-border bg-surface-secondary p-4"
                style={BLOCK_STYLE}
            >
                <SummaryRow
                    label={RECONCILE_TEXTS.statementBalance}
                    value={statementText}
                    isStrong
                />
                <View className="mt-1 border-t border-border pt-1">
                    <SummaryRow label={RECONCILE_TEXTS.beginningBalance} value={beginningText} />
                    <SummaryRow label={outLabel} value={outText} />
                    <SummaryRow label={inLabel} value={inText} />
                </View>
                <View className="mt-1 border-t border-border pt-1">
                    <SummaryRow
                        label={RECONCILE_TEXTS.clearedBalance}
                        value={clearedText}
                        isStrong
                    />
                </View>
                <DifferenceRow value={differenceText} />
                <Text className="pt-3 text-xs text-muted-foreground">{model.finishedText}</Text>
            </View>
            <Text className="text-sm text-foreground">{countLine}</Text>
            <View className={buttons}>
                <ViewReportButton model={model} isVisible={model.reportHref !== null} />
                <Button
                    testID="reconcile-another"
                    variant="outline"
                    className="min-h-11"
                    onPress={model.onAnother}
                >
                    <ButtonText>{RECONCILE_TEXTS.another}</ButtonText>
                </Button>
                <Button
                    testID="reconcile-view-register"
                    variant="outline"
                    className="min-h-11"
                    onPress={model.onViewRegister}
                >
                    <ButtonText>{RECONCILE_TEXTS.viewRegister}</ButtonText>
                </Button>
            </View>
        </View>
    )
}
