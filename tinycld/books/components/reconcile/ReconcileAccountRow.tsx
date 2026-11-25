import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Pressable, Text, View } from 'react-native'
import type { ReconcileAccountRowData, ReconcileRowAction } from '../../hooks/useReconcileAccounts'
import { useRowFocus } from '../../hooks/useRowFocus'
import { accountLabel } from '../../lib/account-options'
import { ownBalance } from '../../lib/account-tree'
import { balanceText } from '../../lib/money'
import { inProgressText, RECONCILE_TEXTS } from '../../lib/reconcile'
import { formatDay } from '../../lib/register-range'
import { accountDisplay } from '../accounts/account-display'
import { ListHeaderCell, ListHeaderRow } from '../ListTable'

// The cells of the accounts table, shared by its header and its rows (reconcile spec §3
// "The accounts screen").
export const ACCOUNT_CELLS = {
    account: { flex: 2, minWidth: 200 },
    type: { flex: 1, minWidth: 110 },
    through: { flex: 1, minWidth: 150 },
    balance: { width: 120 },
    action: { width: 150 },
} as const

// 200 + 110 + 150 + 120 + 150, and the row's padding (pl-4 pr-2).
export const ACCOUNTS_MIN_WIDTH = 754
export const ACCOUNT_ROW_HEIGHT = 56
export const ACCOUNT_CARD_HEIGHT = 92
const ACCOUNT_ROW_CLASS = 'flex-row items-center pl-4 pr-2 border-b border-border bg-background'

export type AccountRowProps = {
    row: ReconcileAccountRowData
    action: ReconcileRowAction
    // The keyboard's row focus (web only, core rowFocusStyle).
    isFocused: boolean
    onPress: (row: ReconcileAccountRowData) => void
    onThroughPress: (row: ReconcileAccountRowData) => void
}

function currencyOf(row: ReconcileAccountRowData): string {
    return row.currency || 'USD'
}

function balanceOf(row: ReconcileAccountRowData): string {
    return balanceText(ownBalance(row.type, row.debit_total, row.credit_total), currencyOf(row))
}

// The row's button: Reconcile (outline) opens the start dialog, Resume (primary) and View
// (outline, a reader) open the reconciliation in progress. A reader with none in progress
// has no button.
function AccountAction({
    row,
    action,
    onPress,
}: Omit<AccountRowProps, 'isFocused' | 'onThroughPress'>) {
    const id = row.id
    const press = () => onPress(row)
    if (action === 'resume') {
        return (
            <Button testID={`reconcile-resume-${id}`} className="min-h-11" onPress={press}>
                <ButtonText>Resume</ButtonText>
            </Button>
        )
    }
    if (action === 'view') {
        return (
            <Button
                testID={`reconcile-view-${id}`}
                variant="outline"
                className="min-h-11"
                onPress={press}
            >
                <ButtonText>View</ButtonText>
            </Button>
        )
    }
    if (action === 'none') return null
    return (
        <Button
            testID={`reconcile-start-${id}`}
            variant="outline"
            className="min-h-11"
            onPress={press}
        >
            <ButtonText>Reconcile</ButtonText>
        </Button>
    )
}

// "Sep 30, 2026" as a link to that finished summary (its own press, so the row's press does
// not run), or "Never". The card puts "Reconciled through " before the link and says
// "Never reconciled".
function ThroughText({
    row,
    isCard,
    onThroughPress,
}: {
    row: ReconcileAccountRowData
    isCard: boolean
    onThroughPress: AccountRowProps['onThroughPress']
}) {
    if (!row.lastFinished) {
        const never = isCard ? RECONCILE_TEXTS.neverReconciled : RECONCILE_TEXTS.never
        return (
            <Text numberOfLines={1} className="text-sm text-muted-foreground">
                {never}
            </Text>
        )
    }
    const day = formatDay(row.lastFinished.statement_date)
    const prefix = isCard ? 'Reconciled through ' : ''
    const press = () => onThroughPress(row)
    return (
        <Text numberOfLines={1} className="text-sm text-muted-foreground">
            {prefix}
            <Text
                testID={`reconcile-through-${row.id}`}
                accessibilityRole="link"
                onPress={press}
                className="text-sm text-primary"
            >
                {day}
            </Text>
        </Text>
    )
}

function ProgressLine({ row }: { row: ReconcileAccountRowData }) {
    if (!row.inProgress) return null
    return (
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {inProgressText(row.inProgress.statement_date)}
        </Text>
    )
}

// One account of the wide table: Account (with "In progress · statement of …" under it) ·
// Type · Reconciled through · In Books · the action. A press on the row does what its
// button does. The row has no button role: it holds the action button and the date link,
// and on web a button inside a button is not valid HTML. The action button is the control
// a screen reader and Tab reach.
export function ReconcileAccountTableRow({
    row,
    action,
    isFocused,
    onPress,
    onThroughPress,
}: AccountRowProps) {
    const { typeLabel } = accountDisplay(row.type, row.detail_type)
    const focus = useRowFocus(isFocused)
    const style = [{ height: ACCOUNT_ROW_HEIGHT }, focus.style]
    const press = () => onPress(row)
    return (
        <Pressable
            testID={`reconcile-account-${row.id}`}
            onPress={press}
            className={ACCOUNT_ROW_CLASS}
            style={style}
            dataSet={focus.dataSet}
        >
            <View className="min-w-0 pr-3" style={ACCOUNT_CELLS.account}>
                <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                    {accountLabel(row)}
                </Text>
                <ProgressLine row={row} />
            </View>
            <View className="min-w-0 pr-3" style={ACCOUNT_CELLS.type}>
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {typeLabel}
                </Text>
            </View>
            <View className="min-w-0 pr-3" style={ACCOUNT_CELLS.through}>
                <ThroughText row={row} isCard={false} onThroughPress={onThroughPress} />
            </View>
            <View className="min-w-0 pr-3" style={ACCOUNT_CELLS.balance}>
                <Text numberOfLines={1} className="text-right text-sm tabular-nums text-foreground">
                    {balanceOf(row)}
                </Text>
            </View>
            <View className="items-end pr-2" style={ACCOUNT_CELLS.action}>
                <AccountAction row={row} action={action} onPress={onPress} />
            </View>
        </Pressable>
    )
}

// One account below the table's minimum width: account and type, "Reconciled through …",
// the progress line, and the balance and the action on the right.
export function ReconcileAccountCard({
    row,
    action,
    isFocused,
    onPress,
    onThroughPress,
}: AccountRowProps) {
    const { typeLabel } = accountDisplay(row.type, row.detail_type)
    const focus = useRowFocus(isFocused)
    const style = [{ height: ACCOUNT_CARD_HEIGHT }, focus.style]
    const press = () => onPress(row)
    return (
        <Pressable
            testID={`reconcile-account-${row.id}`}
            onPress={press}
            className="flex-row items-center gap-3 border-b border-border bg-background px-1"
            style={style}
            dataSet={focus.dataSet}
        >
            <View className="min-w-0 flex-1 gap-0.5">
                <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                    {accountLabel(row)}
                </Text>
                <Text numberOfLines={1} className="text-xs text-muted-foreground">
                    {typeLabel}
                </Text>
                <ThroughText row={row} isCard onThroughPress={onThroughPress} />
                <ProgressLine row={row} />
            </View>
            <View className="items-end gap-1">
                <Text className="text-sm font-semibold tabular-nums text-foreground">
                    {balanceOf(row)}
                </Text>
                <AccountAction row={row} action={action} onPress={onPress} />
            </View>
        </Pressable>
    )
}

export function ReconcileAccountsHeader() {
    return (
        <ListHeaderRow testID="reconcile-accounts-header">
            <ListHeaderCell label="Account" style={ACCOUNT_CELLS.account} />
            <ListHeaderCell label="Type" style={ACCOUNT_CELLS.type} />
            <ListHeaderCell label="Reconciled through" style={ACCOUNT_CELLS.through} />
            <ListHeaderCell label="In Books" style={ACCOUNT_CELLS.balance} align="right" />
            <View style={ACCOUNT_CELLS.action} />
        </ListHeaderRow>
    )
}
