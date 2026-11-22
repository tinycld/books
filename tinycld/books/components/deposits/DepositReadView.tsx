import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { ScrollView, View } from 'react-native'
import type { DepositRecordView } from '../../hooks/useDepositRecord'
import { accountLabel } from '../../lib/account-options'
import { itemAmountText } from '../../lib/deposit'
import { formatDay } from '../../lib/register-range'
import { DocumentHeader } from '../documents/DocumentHeader'
import { Detail, READ_BAND, ReplacedBy, Stamp, stampOf } from '../payments/read-view-parts'
import { DepositBackLink } from './DepositBackLink'
import { DepositItemsRead } from './DepositItemsRead'
import { DepositLinesRead } from './DepositLinesRead'
import { DepositReadActions } from './DepositReadActions'
import { DepositTotals } from './DepositTotals'

interface DepositReadViewProps {
    deposit: NonNullable<DepositRecordView['deposit']>
    items: DepositRecordView['items']
    lines: DepositRecordView['lines']
    currency: string
    canWrite: boolean
    scopeOwner: ScopeOwner
}

/**
 * A posted or void deposit (bank deposit spec §3.8): the header with "Deposit 1004", the
 * status and the Deposit total; Deposit to and the date; the items deposited; the other
 * funds lines when there are any; the totals the server wrote at posting; the memo; the
 * stamps and "Replaced by"; and the bar.
 */
export function DepositReadView({
    deposit,
    items,
    lines,
    currency,
    canWrite,
    scopeOwner,
}: DepositReadViewProps) {
    const title = `Deposit ${deposit.number}`
    const figure = itemAmountText(deposit.total, currency)
    const depositTo = deposit.depositTo ? accountLabel(deposit.depositTo) : ''
    const date = formatDay(deposit.date.slice(0, 10))
    const posted = stampOf('Posted', deposit.postedByName, deposit.posted_at)
    const voided = stampOf('Voided', deposit.voidedByName, deposit.voided_at)
    const hasItems = items.length > 0
    const hasLines = lines.length > 0
    return (
        <View testID="deposit-read-only" className="flex-1 bg-background">
            <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-2 pb-6">
                <DepositBackLink />
                <DocumentHeader
                    title={title}
                    status={deposit.status}
                    figure={figure}
                    isExpired={false}
                />
                <View className={`${READ_BAND} flex-row flex-wrap gap-x-6 gap-y-3`}>
                    <Detail label="Deposit to" value={depositTo} testID="deposit-detail-account" />
                    <Detail label="Deposit date" value={date} testID="deposit-detail-date" />
                </View>
                <DepositItemsRead isVisible={hasItems} items={items} currency={currency} />
                <DepositLinesRead isVisible={hasLines} lines={lines} currency={currency} />
                <DepositTotals
                    itemsTotal={deposit.items_total}
                    linesTotal={deposit.lines_total}
                    total={deposit.total}
                    hasLines={hasLines}
                    currency={currency}
                />
                <Detail label="Memo" value={deposit.memo} testID="deposit-memo-text" />
                <View className="gap-1">
                    <Stamp text={posted} testID="deposit-posted-by" />
                    <Stamp text={voided} testID="deposit-voided-by" />
                    <ReplacedBy
                        replacement={deposit.replacement}
                        routeBase="books/deposits"
                        testID="deposit-replaced-by"
                    />
                </View>
            </ScrollView>
            <DepositReadActions deposit={deposit} canWrite={canWrite} scopeOwner={scopeOwner} />
        </View>
    )
}
