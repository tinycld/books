import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { Link } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { useBankAccountsWidget } from '../../hooks/useBankAccountsWidget'
import { type BankAccountsModel, type BankRow, dashboardAmount } from '../../lib/dashboard-figures'
import {
    LABEL_STYLE,
    LinksRow,
    type Money,
    NO_SHRINK,
    TextLink,
    WidgetCard,
    WidgetEmpty,
} from './WidgetCard'
import type { WidgetProps } from './widgets'

const ROW_STYLE = { minHeight: 44 }

function reviewText(count: number): string {
    return `${count} to review`
}

function moreText(count: number): string {
    return count === 1 ? '1 more account' : `${count} more accounts`
}

// A negative balance, or one Books cannot hold exactly, draws in the danger tone, unless
// it is masked: the mask tells nothing about the amount.
function balanceClass(balance: number | null, hideAmounts: boolean): string {
    const isDanger = !hideAmounts && (balance === null || balance < 0)
    const tone = isDanger ? 'text-danger' : 'text-foreground'
    return `text-sm font-medium tabular-nums ${tone}`
}

// "N to review" under the row: Banking opened on that account's connection. It sits
// below the row's link, not inside it: a link inside a link is not valid on web.
function ReviewLink({ row }: { row: BankRow }) {
    const orgHref = useOrgHref()
    if (row.reviewCount <= 0 || !row.connectionId) return null
    const href = orgHref('books/banking', { account: row.connectionId })
    return (
        <Link href={href} asChild>
            <Pressable
                testID={`dashboard-bank-review-${row.accountId}`}
                accessibilityRole="link"
                className="self-start pb-2 web:cursor-pointer"
                hitSlop={8}
            >
                <Text className="text-xs text-primary">{reviewText(row.reviewCount)}</Text>
            </Pressable>
        </Link>
    )
}

function BankAccountRow({
    row,
    money,
    hideAmounts,
}: {
    row: BankRow
    money: Money
    hideAmounts: boolean
}) {
    const orgHref = useOrgHref()
    const href = orgHref(`books/accounts/${row.accountId}`)
    const amountClass = balanceClass(row.balance, hideAmounts)
    const amount = money(row.balance)
    return (
        <View className="border-b border-border">
            <Link href={href} asChild>
                <Pressable
                    testID={`dashboard-bank-row-${row.accountId}`}
                    accessibilityRole="link"
                    className="flex-row items-center justify-between gap-3 py-2 web:cursor-pointer"
                    style={ROW_STYLE}
                >
                    <Text className="text-sm text-foreground" style={LABEL_STYLE} numberOfLines={1}>
                        {row.label}
                    </Text>
                    <Text className={amountClass} style={NO_SHRINK}>
                        {amount}
                    </Text>
                </Pressable>
            </Link>
            <ReviewLink row={row} />
        </View>
    )
}

function BankAccountsBody({
    model,
    money,
    hideAmounts,
    canWrite,
}: {
    model: BankAccountsModel
    money: Money
    hideAmounts: boolean
    canWrite: boolean
}) {
    const orgHref = useOrgHref()
    const chartHref = orgHref('books/accounts')
    if (model.isEmpty) {
        return (
            <WidgetEmpty
                widget="bankAccounts"
                text="No bank accounts."
                actionLabel="Chart of Accounts"
                actionHref={chartHref}
                isActionVisible={canWrite}
            />
        )
    }
    const rows = model.rows.map(row => (
        <BankAccountRow key={row.accountId} row={row} money={money} hideAmounts={hideAmounts} />
    ))
    const more = moreText(model.moreCount)
    const hasMore = model.moreCount > 0
    return (
        <View>
            {rows}
            <TextLink
                testID="dashboard-bank-more"
                label={more}
                href={chartHref}
                isVisible={hasMore}
            />
        </View>
    )
}

// The Bank accounts widget (spec §3 "Bank accounts widget"): each active Bank and Credit
// card account in chart order with its balance in the books (Books has no bank-reported
// balance), its count to review, and the link to Banking.
export function BankAccountsWidget({ hideAmounts, canWrite }: WidgetProps) {
    const { state, retry, currency } = useBankAccountsWidget()
    const orgHref = useOrgHref()
    const bankingHref = orgHref('books/banking')
    const money: Money = cents => dashboardAmount(cents, currency, hideAmounts)
    const body =
        state.status === 'ready' ? (
            <BankAccountsBody
                model={state.model}
                money={money}
                hideAmounts={hideAmounts}
                canWrite={canWrite}
            />
        ) : null
    return (
        <WidgetCard widget="bankAccounts" state={state} onRetry={retry}>
            {body}
            <LinksRow>
                <TextLink
                    testID="dashboard-bank-banking"
                    label="Go to Banking"
                    href={bankingHref}
                />
            </LinksRow>
        </WidgetCard>
    )
}
