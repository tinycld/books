import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { View } from 'react-native'
import { useAccountsQuery } from '../../hooks/useAccountsQuery'
import { useDashboardBalances } from '../../hooks/useDashboardBalances'
import { useShippedReportHref } from '../../hooks/useShippedReportHref'
import {
    dashboardAmount,
    type ExpenseRow,
    type ExpensesModel,
    expensesModel,
    type Loadable,
} from '../../lib/dashboard-figures'
import { periodLabel, periodRange } from '../../lib/dashboard-periods'
import { PERIOD_LABELS, type PeriodId } from '../../lib/dashboard-prefs'
import { EXPENSES_BY_VENDOR_SHIPPED_KEY } from '../../lib/shipped-reports'
import { PeriodMenu } from './PeriodMenu'
import {
    BarRow,
    Figure,
    LinksRow,
    type Money,
    TextLink,
    WidgetCard,
    WidgetEmpty,
} from './WidgetCard'
import type { WidgetProps } from './widgets'

function RankedRow({ row, money }: { row: ExpenseRow; money: Money }) {
    const fill = row.isEverythingElse ? 'bg-muted' : 'bg-primary'
    const amount = money(row.amount)
    return (
        <BarRow
            testID={`dashboard-expenses-row-${row.key}`}
            label={row.label}
            amount={amount}
            share={row.share}
            fill={fill}
        />
    )
}

function ExpensesBody({
    model,
    money,
    canWrite,
}: {
    model: ExpensesModel
    money: Money
    canWrite: boolean
}) {
    const orgHref = useOrgHref()
    if (model.isEmpty) {
        const text = `No expenses in ${periodLabel(model.period).toLowerCase()}.`
        const createHref = orgHref('books/expenses/new')
        return (
            <WidgetEmpty
                widget="expenses"
                text={text}
                actionLabel="Record expense"
                actionHref={createHref}
                isActionVisible={canWrite}
            />
        )
    }
    const rows = model.rows.map(row => <RankedRow key={row.key} row={row} money={money} />)
    const totalText = money(model.total)
    return (
        <>
            <Figure testID="dashboard-expenses-total" label="Total expenses" text={totalText} />
            <View className="gap-3 pt-1">{rows}</View>
        </>
    )
}

function expensesState(
    period: PeriodId,
    balances: ReturnType<typeof useDashboardBalances>,
    accounts: ReturnType<typeof useAccountsQuery>
): Loadable<ExpensesModel> {
    if (balances.isError || accounts.isError) return { status: 'error' }
    if (!balances.isReady || !accounts.isReady) return { status: 'loading' }
    const range = periodRange(period, balances.today, balances.fiscalStart)
    const model = expensesModel(balances.rows, period, range, accounts.data ?? [])
    return { status: 'ready', model }
}

// The widget's state: the balance rows and the chart's accounts (the roll-up walks their
// parents) must both be ready.
function useExpensesState(period: PeriodId) {
    const balances = useDashboardBalances()
    const accounts = useAccountsQuery()
    const state = expensesState(period, balances, accounts)
    // Each part restarts only a read that failed.
    const retry = () => {
        balances.retry()
        if (accounts.isError) accounts.retry()
    }
    return { state, retry, currency: balances.currency }
}

// The Expenses widget (spec §3 "Expenses widget"): the net debit of the expense-side
// accounts in the chosen period, the four largest top-level accounts and "Everything
// else", and the link to Expenses by vendor.
export function ExpensesWidget({
    hideAmounts,
    canWrite,
    prefs,
    isPrefsReady,
    onPrefsChange,
}: WidgetProps) {
    const period = prefs.periods.expenses
    const { state, retry, currency } = useExpensesState(period)
    const reportHref = useShippedReportHref(EXPENSES_BY_VENDOR_SHIPPED_KEY)
    const money: Money = cents => dashboardAmount(cents, currency, hideAmounts)
    const onPeriodChange = (next: PeriodId) =>
        onPrefsChange({ ...prefs, periods: { ...prefs.periods, expenses: next } })
    const periodMenu = (
        <PeriodMenu
            widget="expenses"
            labels={PERIOD_LABELS}
            value={period}
            onChange={onPeriodChange}
            isDisabled={!isPrefsReady}
        />
    )
    const body =
        state.status === 'ready' ? (
            <ExpensesBody model={state.model} money={money} canWrite={canWrite} />
        ) : null
    return (
        <WidgetCard widget="expenses" state={state} onRetry={retry} headerRight={periodMenu}>
            {body}
            <LinksRow>
                <TextLink
                    testID="dashboard-expenses-report"
                    label="Expenses by vendor"
                    href={reportHref}
                />
            </LinksRow>
        </WidgetCard>
    )
}
