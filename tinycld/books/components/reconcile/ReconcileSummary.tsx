import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ChevronDown, ChevronUp, CircleAlert, CircleCheck } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { ReconcileScreenModel } from '../../hooks/useReconcileScreen'
import {
    balanceWord,
    bandMoney,
    compactClearedText,
    countText,
    RECONCILE_TEXTS,
    type ReconcileTotals,
    type SideWords,
    sideOffText,
    statementSideText,
} from '../../lib/reconcile'
import type { BooksReconciliations } from '../../types'

const BAND_CLASS = 'rounded-xl border border-border bg-surface-secondary'

type BandReconciliation = Pick<
    BooksReconciliations,
    | 'statement_balance'
    | 'beginning_balance'
    | 'has_statement_totals'
    | 'statement_out'
    | 'statement_in'
>

type BandProps = {
    reconciliation: BandReconciliation
    totals: ReconcileTotals
    words: SideWords
    currency: string
}

function Figure({
    label,
    value,
    size,
    children,
}: {
    label: string
    value: string
    size: 'xl' | 'sm'
    children?: ReactNode
}) {
    const valueClass = size === 'xl' ? 'text-xl font-semibold' : 'text-sm font-medium'
    return (
        <View className="gap-0.5">
            <Text className="text-xs text-muted-foreground">{label}</Text>
            <Text className={`${valueClass} tabular-nums text-foreground`}>{value}</Text>
            {children}
        </View>
    )
}

function operatorName(text: string): string {
    if (text === '−') return 'minus'
    if (text === '+') return 'plus'
    return 'equals'
}

// The empty label line puts the sign on the line of the figures' values.
function Operator({ text, size }: { text: string; size: 'xl' | 'sm' }) {
    const textClass = size === 'xl' ? 'text-xl' : 'text-sm'
    return (
        <View className="gap-0.5">
            <Text className="text-xs"> </Text>
            <Text
                accessibilityLabel={operatorName(text)}
                className={`${textClass} text-muted-foreground`}
            >
                {text}
            </Text>
        </View>
    )
}

// "of $580.00 on the statement", and "$30.00 under" / "$30.00 over" when the cleared side
// differs from it. Only when the statement totals were entered.
function StatementSide({
    off,
    statement,
    currency,
}: {
    off: number | null
    statement: number
    currency: string
}) {
    if (off === null) return null
    const offText = sideOffText(off, currency)
    const offLine = offText === '' ? null : <Text className="text-xs text-danger">{offText}</Text>
    return (
        <>
            <Text className="text-xs tabular-nums text-muted-foreground">
                {statementSideText(statement, currency)}
            </Text>
            {offLine}
        </>
    )
}

// The cleared balance in its parts: Beginning balance − 3 payments + 1 deposit (a card:
// + charges − payments), each sign kept with its figure when the line wraps.
function ClearedParts({ reconciliation, totals, words, currency }: BandProps) {
    const money = (cents: number) => bandMoney(cents, totals, currency)
    const outLabel = countText(totals.outCount, words.outOne, words.outMany)
    const inLabel = countText(totals.inCount, words.inOne, words.inMany)
    return (
        <View className="flex-row flex-wrap items-start gap-x-4 gap-y-2 border-t border-border pt-2">
            <Figure label="Beginning balance" value={money(totals.beginning)} size="sm" />
            <View className="flex-row items-start gap-x-4">
                <Operator text={words.outOperator} size="sm" />
                <Figure label={outLabel} value={money(totals.clearedOut)} size="sm">
                    <StatementSide
                        off={totals.outOff}
                        statement={reconciliation.statement_out}
                        currency={currency}
                    />
                </Figure>
            </View>
            <View className="flex-row items-start gap-x-4">
                <Operator text={words.inOperator} size="sm" />
                <Figure label={inLabel} value={money(totals.clearedIn)} size="sm">
                    <StatementSide
                        off={totals.inOff}
                        statement={reconciliation.statement_in}
                        currency={currency}
                    />
                </Figure>
            </View>
        </View>
    )
}

// Lucide CircleCheck in success at $0.00, CircleAlert in warning otherwise: decoration
// only, the word beside it carries the state.
function StateMark({ isBalanced, size }: { isBalanced: boolean; size: number }) {
    const success = useThemeColor('success')
    const warning = useThemeColor('warning')
    if (isBalanced) return <CircleCheck size={size} color={success} />
    return <CircleAlert size={size} color={warning} />
}

function DifferenceBlock({ totals, currency }: Pick<BandProps, 'totals' | 'currency'>) {
    const isBalanced = totals.difference === 0
    return (
        <View
            testID="reconcile-difference"
            accessibilityLiveRegion="polite"
            className="flex-row items-center gap-3"
        >
            <StateMark isBalanced={isBalanced} size={28} />
            <View className="gap-0.5">
                <Text className="text-xs text-muted-foreground">Difference</Text>
                <Text className="text-2xl font-semibold tabular-nums text-foreground">
                    {bandMoney(totals.difference, totals, currency)}
                </Text>
                <Text className="text-sm font-medium text-foreground">
                    {balanceWord(totals.difference)}
                </Text>
            </View>
        </View>
    )
}

// Wide: Statement ending balance − Cleared balance (its parts under it) = Difference.
function WideBand(props: BandProps) {
    const { reconciliation, totals, currency } = props
    return (
        <View testID="reconcile-summary" className={`${BAND_CLASS} flex-row items-start gap-5 p-4`}>
            <Figure
                label="Statement ending balance"
                value={bandMoney(reconciliation.statement_balance, totals, currency)}
                size="xl"
            />
            <Operator text="−" size="xl" />
            <View className="min-w-0 flex-1 gap-2">
                <Figure
                    label="Cleared balance"
                    value={bandMoney(totals.clearedBalance, totals, currency)}
                    size="xl"
                />
                <ClearedParts {...props} />
            </View>
            <Operator text="=" size="xl" />
            <View className="border-l border-border pl-5">
                <DifferenceBlock totals={totals} currency={currency} />
            </View>
        </View>
    )
}

function PhoneBandBody(props: BandProps & { isOpen: boolean }) {
    const { reconciliation, totals, currency, isOpen } = props
    if (!isOpen) return null
    return (
        <View className="gap-3 border-t border-border px-3 pb-3 pt-3">
            <Figure
                label="Statement ending balance"
                value={bandMoney(reconciliation.statement_balance, totals, currency)}
                size="xl"
            />
            <View className="gap-2">
                <View className="flex-row items-start gap-3">
                    <Operator text="−" size="xl" />
                    <Figure
                        label="Cleared balance"
                        value={bandMoney(totals.clearedBalance, totals, currency)}
                        size="xl"
                    />
                </View>
                <ClearedParts {...props} />
            </View>
        </View>
    )
}

// A phone: one compact bar, the difference with its mark and word and "Cleared $x of $y";
// a press (44 pt) opens the full band in place, a second press closes it.
function PhoneBand(props: BandProps & { isOpen: boolean; onToggle: () => void }) {
    const { reconciliation, totals, currency, isOpen, onToggle } = props
    const color = useThemeColor('muted-foreground')
    const Chevron = isOpen ? ChevronUp : ChevronDown
    const label = isOpen ? RECONCILE_TEXTS.hideBalances : RECONCILE_TEXTS.showBalances
    const expanded = { expanded: isOpen }
    const cleared = compactClearedText(totals, reconciliation.statement_balance, currency)
    return (
        <View testID="reconcile-summary" className={BAND_CLASS}>
            <Pressable
                testID="reconcile-summary-toggle"
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={expanded}
                onPress={onToggle}
                className="flex-row items-center gap-3 px-3 py-2"
                style={{ minHeight: 44 }}
            >
                <StateMark isBalanced={totals.difference === 0} size={24} />
                <View
                    testID="reconcile-difference"
                    accessibilityLiveRegion="polite"
                    className="min-w-0 flex-1"
                >
                    <View className="flex-row flex-wrap items-baseline gap-x-2">
                        <Text className="text-2xl font-semibold tabular-nums text-foreground">
                            {bandMoney(totals.difference, totals, currency)}
                        </Text>
                        <Text className="text-sm font-medium text-foreground">
                            {balanceWord(totals.difference)}
                        </Text>
                    </View>
                    <Text numberOfLines={1} className="text-xs tabular-nums text-muted-foreground">
                        {cleared}
                    </Text>
                </View>
                <Chevron size={18} color={color} />
            </Pressable>
            <PhoneBandBody {...props} />
        </View>
    )
}

/**
 * The summary band (reconcile spec §3 "Summary band"): two lines on wide, the compact bar
 * that opens in place on a phone. All figures are integer cents from `reconcileTotals` (or
 * the stamped sums of a finished reconciliation), shown with formatMoney, or TOO_LARGE_TEXT
 * when a sum is above maxStoredAmount (`bandMoney`).
 */
export function ReconcileSummary({ model }: { model: ReconcileScreenModel }) {
    const { reconciliation, totals } = model
    if (!reconciliation || !totals) return null
    const props: BandProps = {
        reconciliation,
        totals,
        words: model.words,
        currency: model.currency,
    }
    if (model.isWide) return <WideBand {...props} />
    return <PhoneBand {...props} isOpen={model.isBandOpen} onToggle={model.onToggleBand} />
}
