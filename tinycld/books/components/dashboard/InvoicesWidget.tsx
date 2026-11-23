import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { Text, View } from 'react-native'
import { useInvoicesWidget } from '../../hooks/useInvoicesWidget'
import { useShippedReportHref } from '../../hooks/useShippedReportHref'
import { dashboardAmount, dashboardTone, type InvoicesModel } from '../../lib/dashboard-figures'
import { AR_AGING_SHIPPED_KEY } from '../../lib/shipped-reports'
import {
    AmountLine,
    Bar,
    type BarPart,
    Figure,
    type FigureTone,
    LinksRow,
    type Money,
    TextLink,
    WidgetCard,
    WidgetEmpty,
} from './WidgetCard'
import type { WidgetProps } from './widgets'

type Tone = (cents: number | null) => FigureTone

function overdueText(count: number): string {
    return count === 1 ? '1 overdue invoice' : `${count} overdue invoices`
}

function OverdueLine({ count }: { count: number }) {
    if (count <= 0) return null
    return (
        <Text testID="dashboard-invoices-overdue-count" className="text-sm text-danger">
            {overdueText(count)}
        </Text>
    )
}

// "Waiting to deposit": only when the Undeposited funds balance is not zero; a link to a
// new bank deposit for a writer. An amount Books cannot hold exactly draws in the danger
// tone (plan D1), unless it is masked (dashboardTone).
function DepositLine({
    cents,
    money,
    tone: toneOf,
    canWrite,
}: {
    cents: number | null
    money: Money
    tone: Tone
    canWrite: boolean
}) {
    const orgHref = useOrgHref()
    if (cents === 0) return null
    const href = canWrite ? orgHref('books/deposits/new') : null
    const tone = toneOf(cents)
    const text = money(cents)
    return (
        <AmountLine
            testID="dashboard-invoices-deposit"
            label="Waiting to deposit"
            text={text}
            tone={tone}
            href={href}
        />
    )
}

function SplitAmount({
    testID,
    text,
    label,
    isEnd,
}: {
    testID: string
    text: string
    label: string
    isEnd: boolean
}) {
    const align = isEnd ? 'items-end' : ''
    return (
        <View className={align}>
            <Text testID={testID} className="text-sm font-medium tabular-nums text-foreground">
                {text}
            </Text>
            <Text className="text-xs text-muted-foreground">{label}</Text>
        </View>
    )
}

interface BodyProps {
    model: InvoicesModel
    money: Money
    tone: Tone
    canWrite: boolean
}

function InvoicesFigures({ model, money, tone, canWrite }: BodyProps) {
    const parts: BarPart[] = [
        { key: 'overdue', weight: model.overdue, className: 'bg-danger' },
        { key: 'not-due', weight: model.notDue, className: 'bg-primary' },
    ]
    const unpaidText = money(model.unpaid)
    const overdueAmount = money(model.overdue)
    const notDueText = money(model.notDue)
    const paidText = money(model.paidLast30Days)
    const unpaidTone = tone(model.unpaid)
    const paidTone = tone(model.paidLast30Days)
    return (
        <>
            <Figure
                testID="dashboard-invoices-unpaid"
                label="Unpaid"
                text={unpaidText}
                tone={unpaidTone}
            />
            <OverdueLine count={model.overdueCount} />
            <Bar testID="dashboard-invoices-bar" parts={parts} />
            <View className="flex-row justify-between gap-3">
                <SplitAmount
                    testID="dashboard-invoices-overdue"
                    text={overdueAmount}
                    label="Overdue"
                    isEnd={false}
                />
                <SplitAmount
                    testID="dashboard-invoices-not-due"
                    text={notDueText}
                    label="Not due yet"
                    isEnd
                />
            </View>
            <View>
                <AmountLine
                    label="Paid, last 30 days"
                    text={paidText}
                    tone={paidTone}
                    textTestID="dashboard-invoices-paid"
                />
                <DepositLine
                    cents={model.waitingToDeposit}
                    money={money}
                    tone={tone}
                    canWrite={canWrite}
                />
            </View>
        </>
    )
}

function InvoicesBody({ model, money, tone, canWrite }: BodyProps) {
    const orgHref = useOrgHref()
    if (model.isEmpty) {
        const createHref = orgHref('books/invoices/new')
        return (
            <WidgetEmpty
                widget="invoices"
                text="No unpaid invoices."
                actionLabel="Create invoice"
                actionHref={createHref}
                isActionVisible={canWrite}
            />
        )
    }
    return <InvoicesFigures model={model} money={money} tone={tone} canWrite={canWrite} />
}

function InvoicesLinks() {
    const orgHref = useOrgHref()
    const agingHref = useShippedReportHref(AR_AGING_SHIPPED_KEY)
    const invoicesHref = orgHref('books/invoices')
    return (
        <LinksRow>
            <TextLink testID="dashboard-invoices-view" label="View invoices" href={invoicesHref} />
            <TextLink testID="dashboard-invoices-aging" label="A/R aging" href={agingHref} />
        </LinksRow>
    )
}

// The Invoices widget (spec §3 "Invoices widget"): Unpaid split into Overdue and Not due
// yet, Paid in the last 30 days, the Undeposited funds balance, and the links to the
// invoices and to A/R Aging. Every amount goes through dashboardAmount.
export function InvoicesWidget({ hideAmounts, canWrite }: WidgetProps) {
    const { state, retry, currency } = useInvoicesWidget()
    const money: Money = cents => dashboardAmount(cents, currency, hideAmounts)
    const tone: Tone = cents => dashboardTone(cents, hideAmounts)
    const body =
        state.status === 'ready' ? (
            <InvoicesBody model={state.model} money={money} tone={tone} canWrite={canWrite} />
        ) : null
    return (
        <WidgetCard widget="invoices" state={state} onRetry={retry}>
            {body}
            <InvoicesLinks />
        </WidgetCard>
    )
}
