import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useDashboardBalances } from '../../hooks/useDashboardBalances'
import { useShippedReportHref } from '../../hooks/useShippedReportHref'
import {
    dashboardAmount,
    type Loadable,
    latestShownMonth,
    type SalesModel,
    type SalesMonth,
    salesModel,
} from '../../lib/dashboard-figures'
import { periodLabel, periodRange } from '../../lib/dashboard-periods'
import { SALES_PERIOD_LABELS, type SalesPeriodId } from '../../lib/dashboard-prefs'
import { SALES_BY_CUSTOMER_SHIPPED_KEY } from '../../lib/shipped-reports'
import { PeriodMenu } from './PeriodMenu'
import { Figure, LinksRow, type Money, TextLink, WidgetCard, WidgetEmpty } from './WidgetCard'
import type { WidgetProps } from './widgets'

const COLUMNS_HEIGHT = 96
const BASELINE_HEIGHT = 2
const LEAST_COLUMN_HEIGHT = 4
const SHOWN_LETTERS_UP_TO = 6
// Each column shares the card's width and never widens it.
const COLUMN_STYLE = { flex: 1, minWidth: 0 }
const COLUMN_AREA_STYLE = { height: COLUMNS_HEIGHT }

interface MonthColumnProps {
    month: SalesMonth
    largest: number
    isPicked: boolean
    // Many columns in a one-column page are narrow: the label is the month's first letter.
    isLetter: boolean
    money: Money
    onPick: (month: string) => void
}

function columnLook(month: SalesMonth, largest: number, isPicked: boolean) {
    const hasSales = month.amount > 0
    if (!hasSales) {
        // A month with zero or negative sales draws a baseline mark only.
        return { fill: 'bg-muted', style: { height: BASELINE_HEIGHT } }
    }
    // The floor keeps a small positive month apart from the 2 px baseline mark of a zero or
    // negative month.
    const height = Math.max(LEAST_COLUMN_HEIGHT, (month.amount / largest) * COLUMNS_HEIGHT)
    const style = {
        height,
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4,
        opacity: isPicked ? 1 : 0.55,
    }
    return { fill: 'bg-primary', style }
}

function MonthColumn({ month, largest, isPicked, isLetter, money, onPick }: MonthColumnProps) {
    const { fill, style } = columnLook(month, largest, isPicked)
    const label = isLetter ? month.shortLabel.slice(0, 1) : month.shortLabel
    const accessibleName = `${month.longLabel}: ${money(month.amount)}`
    const pick = () => onPick(month.month)
    const selectedState = { selected: isPicked }
    return (
        <Pressable
            testID={`dashboard-sales-column-${month.month}`}
            accessibilityLabel={accessibleName}
            accessibilityRole="button"
            accessibilityState={selectedState}
            onPress={pick}
            onFocus={pick}
            className="gap-1 web:cursor-pointer"
            style={COLUMN_STYLE}
        >
            <View className="justify-end" style={COLUMN_AREA_STYLE}>
                <View
                    testID={`dashboard-sales-bar-${month.month}`}
                    className={fill}
                    style={style}
                />
            </View>
            <Text className="text-center text-xs text-muted-foreground" numberOfLines={1}>
                {label}
            </Text>
        </Pressable>
    )
}

interface BodyProps {
    model: SalesModel
    money: Money
    canWrite: boolean
    today: string
    isOneColumn: boolean
}

// The picked column is local to the body, which the widget keys on the period, so a
// period change starts with no pick and the line shows the latest month again.
function SalesBody({ model, money, canWrite, today, isOneColumn }: BodyProps) {
    const orgHref = useOrgHref()
    const [pickedMonth, setPickedMonth] = useState<string | null>(null)
    if (model.isEmpty) {
        const text = `No sales in ${periodLabel(model.period).toLowerCase()}.`
        const createHref = orgHref('books/invoices/new')
        return (
            <WidgetEmpty
                widget="sales"
                text={text}
                actionLabel="Create invoice"
                actionHref={createHref}
                isActionVisible={canWrite}
            />
        )
    }
    // With no column picked the line shows the latest month that is not after today's.
    const picked =
        model.months.find(month => month.month === pickedMonth) ??
        latestShownMonth(model.months, today)
    const largest = Math.max(...model.months.map(month => month.amount), 1)
    const isLetter = isOneColumn && model.months.length > SHOWN_LETTERS_UP_TO
    const columns = model.months.map(month => (
        <MonthColumn
            key={month.month}
            month={month}
            largest={largest}
            isPicked={month === picked}
            isLetter={isLetter}
            money={money}
            onPick={setPickedMonth}
        />
    ))
    const totalText = money(model.total)
    const pickedText = picked ? `${picked.longLabel}: ${money(picked.amount)}` : ''
    return (
        <>
            <Figure testID="dashboard-sales-total" label="Total sales" text={totalText} />
            <Text testID="dashboard-sales-picked" className="text-sm text-foreground">
                {pickedText}
            </Text>
            <View className="flex-row gap-1 pt-1">{columns}</View>
        </>
    )
}

function salesState(
    period: SalesPeriodId,
    balances: ReturnType<typeof useDashboardBalances>
): Loadable<SalesModel> {
    if (balances.isError) return { status: 'error' }
    if (!balances.isReady) return { status: 'loading' }
    const range = periodRange(period, balances.today, balances.fiscalStart)
    return { status: 'ready', model: salesModel(balances.rows, period, range, balances.today) }
}

// The Sales widget (spec §3 "Sales widget"): the net credit of the Income accounts in the
// chosen period, one column per month, the picked month's line, and the link to Sales by
// customer.
export function SalesWidget({
    hideAmounts,
    canWrite,
    prefs,
    isPrefsReady,
    isOneColumn,
    onPrefsChange,
}: WidgetProps) {
    const period = prefs.periods.sales
    const balances = useDashboardBalances()
    const state = salesState(period, balances)
    const reportHref = useShippedReportHref(SALES_BY_CUSTOMER_SHIPPED_KEY)
    const money: Money = cents => dashboardAmount(cents, balances.currency, hideAmounts)
    const onPeriodChange = (next: SalesPeriodId) =>
        onPrefsChange({ ...prefs, periods: { ...prefs.periods, sales: next } })
    const periodMenu = (
        <PeriodMenu
            widget="sales"
            labels={SALES_PERIOD_LABELS}
            value={period}
            onChange={onPeriodChange}
            isDisabled={!isPrefsReady}
        />
    )
    const body =
        state.status === 'ready' ? (
            <SalesBody
                key={period}
                model={state.model}
                money={money}
                canWrite={canWrite}
                today={balances.today}
                isOneColumn={isOneColumn}
            />
        ) : null
    return (
        <WidgetCard widget="sales" state={state} onRetry={balances.retry} headerRight={periodMenu}>
            {body}
            <LinksRow>
                <TextLink
                    testID="dashboard-sales-report"
                    label="Sales by customer"
                    href={reportHref}
                />
            </LinksRow>
        </WidgetCard>
    )
}
