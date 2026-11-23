import { rangeValue } from '@tinycld/core/reports/lib/params'
import type { ParamDef } from '@tinycld/core/reports/lib/spec'
import { encodeParamValue } from '@tinycld/core/reports/lib/view-url'
import { Text, View } from 'react-native'
import { useDashboardBalances } from '../../hooks/useDashboardBalances'
import { useShippedReportHref } from '../../hooks/useShippedReportHref'
import {
    barShares,
    dashboardAmount,
    dashboardPercent,
    type Loadable,
    type ProfitAndLossModel,
    profitAndLossModel,
} from '../../lib/dashboard-figures'
import { type MonthRange, periodLabel, periodRange } from '../../lib/dashboard-periods'
import { PERIOD_LABELS, type PeriodId } from '../../lib/dashboard-prefs'
import { PROFIT_AND_LOSS_SHIPPED_KEY } from '../../lib/profit-and-loss-fixture'
import { PeriodMenu } from './PeriodMenu'
import {
    BarRow,
    Figure,
    type FigureTone,
    LinksRow,
    type Money,
    TextLink,
    WidgetCard,
    WidgetEmpty,
} from './WidgetCard'
import type { WidgetProps } from './widgets'

// The shipped Profit and Loss report's period param (server/report_profit_and_loss.go).
const PERIOD_PARAM: ParamDef = { id: 'period', type: 'dateRange' }
const NO_PARAMS: Record<string, string> = {}

// The report opened on the widget's months; no param when the range is not a valid one.
function reportParams(range: MonthRange): Record<string, string> {
    const value = rangeValue(range.from, range.to)
    if (!value) return NO_PARAMS
    return { [PERIOD_PARAM.id]: encodeParamValue(PERIOD_PARAM, value) }
}

function changeText(model: ProfitAndLossModel, hideAmounts: boolean): string | null {
    if (!model.change) return null
    const word = model.change.direction === 'up' ? 'Up' : 'Down'
    return `${word} ${dashboardPercent(model.change.percent, hideAmounts)} from the year before`
}

function ChangeLine({ model, hideAmounts }: { model: ProfitAndLossModel; hideAmounts: boolean }) {
    const text = changeText(model, hideAmounts)
    if (!text) return null
    const tone = model.change?.direction === 'up' ? 'text-success' : 'text-danger'
    const lineClass = `text-sm ${tone}`
    return (
        <Text testID="dashboard-pnl-change" className={lineClass}>
            {text}
        </Text>
    )
}

interface BodyProps {
    model: ProfitAndLossModel
    money: Money
    hideAmounts: boolean
}

function ProfitAndLossBody({ model, money, hideAmounts }: BodyProps) {
    if (model.isEmpty) {
        const text = `Nothing posted in ${periodLabel(model.period).toLowerCase()}.`
        return <WidgetEmpty widget="profitAndLoss" text={text} isActionVisible={false} />
    }
    const [incomeShare, expensesShare] = barShares(model.income, model.expenses)
    // A loss draws in the danger tone, unless it is masked: the mask tells nothing.
    const netTone: FigureTone = model.netProfit < 0 && !hideAmounts ? 'danger' : 'normal'
    const netText = money(model.netProfit)
    const incomeText = money(model.income)
    const expensesText = money(model.expenses)
    return (
        <>
            <Figure testID="dashboard-pnl-net" label="Net profit" text={netText} tone={netTone} />
            <ChangeLine model={model} hideAmounts={hideAmounts} />
            <View className="gap-3 pt-1">
                <BarRow
                    label="Income"
                    amount={incomeText}
                    amountTestID="dashboard-pnl-income"
                    share={incomeShare}
                    fill="bg-success"
                />
                <BarRow
                    label="Expenses"
                    amount={expensesText}
                    amountTestID="dashboard-pnl-expenses"
                    share={expensesShare}
                    fill="bg-info"
                />
            </View>
        </>
    )
}

function profitAndLossState(
    period: PeriodId,
    range: MonthRange,
    balances: ReturnType<typeof useDashboardBalances>
): Loadable<ProfitAndLossModel> {
    if (balances.isError) return { status: 'error' }
    if (!balances.isReady) return { status: 'loading' }
    return { status: 'ready', model: profitAndLossModel(balances.rows, period, range) }
}

// The Profit and loss widget (spec §3 "Profit and loss widget"): income minus expenses in
// the chosen period on the accrual basis, the change against the same months a year
// earlier, the two bars, and the link to the Profit and Loss report on those months.
export function ProfitAndLossWidget({
    hideAmounts,
    prefs,
    isPrefsReady,
    onPrefsChange,
}: WidgetProps) {
    const period = prefs.periods.profitAndLoss
    const balances = useDashboardBalances()
    const range = periodRange(period, balances.today, balances.fiscalStart)
    const state = profitAndLossState(period, range, balances)
    const reportHref = useShippedReportHref(PROFIT_AND_LOSS_SHIPPED_KEY, reportParams(range))
    const money: Money = cents => dashboardAmount(cents, balances.currency, hideAmounts)
    const onPeriodChange = (next: PeriodId) =>
        onPrefsChange({ ...prefs, periods: { ...prefs.periods, profitAndLoss: next } })
    const periodMenu = (
        <PeriodMenu
            widget="profitAndLoss"
            labels={PERIOD_LABELS}
            value={period}
            onChange={onPeriodChange}
            isDisabled={!isPrefsReady}
        />
    )
    const body =
        state.status === 'ready' ? (
            <ProfitAndLossBody model={state.model} money={money} hideAmounts={hideAmounts} />
        ) : null
    return (
        <WidgetCard
            widget="profitAndLoss"
            state={state}
            onRetry={balances.retry}
            headerRight={periodMenu}
        >
            {body}
            <LinksRow>
                <TextLink
                    testID="dashboard-pnl-report"
                    label="Profit and Loss report"
                    href={reportHref}
                />
            </LinksRow>
        </WidgetCard>
    )
}
