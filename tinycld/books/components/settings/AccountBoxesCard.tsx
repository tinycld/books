import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { View } from 'react-native'
import type { form1099Controls } from '../../lib/form-1099'
import { type Form1099AccountRow, form1099Accounts } from '../../lib/form-1099-accounts'
import { heldAccountIds, useAccountBoxStore } from '../../stores/account-box-store'
import { AccountBoxRow } from './AccountBoxRow'
import { CardEmptyState } from './CardEmptyState'
import { FieldNote, SectionCard } from './SectionCard'

const ACCOUNTS_NOTE = "Payments posted to these accounts count toward the vendor's 1099 box."
const ACCOUNTS_EMPTY = 'Add an expense account to the chart of accounts first.'

interface AccountBoxesCardProps {
    accounts: Parameters<typeof form1099Accounts>[0]
    controls: ReturnType<typeof form1099Controls>
}

function AccountRows({
    isVisible,
    rows,
    editsBoxes,
}: {
    isVisible: boolean
    rows: Form1099AccountRow[]
    editsBoxes: boolean
}) {
    if (!isVisible) return null
    const items = rows.map(row => <AccountBoxRow key={row.id} row={row} editsBoxes={editsBoxes} />)
    return (
        <>
            <FieldNote text={ACCOUNTS_NOTE} />
            <View className="mt-1">{items}</View>
        </>
    )
}

export function AccountBoxesCard({ accounts, controls }: AccountBoxesCardProps) {
    const pending = useAccountBoxStore(state => state.pending)
    // An inactive account whose clear is in flight stays listed, so its row shows the
    // outcome.
    const rows = form1099Accounts(accounts, heldAccountIds({ pending }))
    const orgHref = useOrgHref()
    const hasRows = rows.length > 0
    const action = controls.showsChartButton ? 'Chart of accounts' : undefined
    const openChart = () => router.push(orgHref('books/accounts'))
    return (
        <SectionCard title="Accounts reported on 1099s">
            <View testID="books-1099-accounts">
                <AccountRows isVisible={hasRows} rows={rows} editsBoxes={controls.editsBoxes} />
                <CardEmptyState
                    isVisible={!hasRows}
                    title={ACCOUNTS_EMPTY}
                    action={action}
                    testID="books-1099-accounts-empty"
                    actionTestID="books-1099-accounts-chart"
                    onAction={openChart}
                />
            </View>
        </SectionCard>
    )
}
