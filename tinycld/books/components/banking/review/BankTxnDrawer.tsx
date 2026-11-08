import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonSpinner, ButtonText } from '@tinycld/core/ui/button'
import {
    Drawer,
    DrawerBackdrop,
    DrawerBody,
    DrawerCloseButton,
    DrawerContent,
    DrawerHeader,
} from '@tinycld/core/ui/drawer'
import { X } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { ReviewDrawerModel } from '../../../hooks/useReviewDrawer'
import { uploadedOnText } from '../../../lib/bank-connections'
import { txnSourceText, txnStatusLabel } from '../../../lib/bank-review'
import { drawerPlacement } from '../../../lib/drawer-placement'
import { formatMoney } from '../../../lib/money'
import { formatDay } from '../../../lib/register-range'

type DrawerModel = ReviewDrawerModel
type Detail = NonNullable<DrawerModel['detail']>

const CLOSE_STYLE = { minWidth: 44, minHeight: 44 }
const BODY_STYLE = { flexShrink: 1 }
const ACTION_STYLE = { minHeight: 44 }

// A label/value row; a fact with no value (no memo, no check number) is not drawn.
function Field({ id, label, value }: { id: string; label: string; value: string }) {
    if (value === '') return null
    return (
        <View testID={`bank-txn-field-${id}`} className="gap-0.5">
            <Text className="text-xs text-muted-foreground">{label}</Text>
            <Text className="text-sm text-foreground">{value}</Text>
        </View>
    )
}

function AmountBlock({ detail, currency }: { detail: Detail; currency: string }) {
    const amount = formatMoney(Math.abs(detail.amount), currency)
    const direction = detail.amount < 0 ? 'Spent' : 'Received'
    const statusLabel = txnStatusLabel(detail.status)
    return (
        <View className="flex-row items-start justify-between gap-3">
            <View className="gap-0.5">
                <Text
                    testID="bank-txn-amount"
                    className="text-2xl font-semibold tabular-nums text-foreground"
                >
                    {amount}
                </Text>
                <Text testID="bank-txn-direction" className="text-sm text-muted-foreground">
                    {direction}
                </Text>
            </View>
            <Text
                testID="bank-txn-status"
                className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground"
            >
                {statusLabel}
            </Text>
        </View>
    )
}

function TxnFields({ detail }: { detail: Detail }) {
    const source = txnSourceText(detail.fileName, detail.line)
    const imported = detail.importedAt ? uploadedOnText(detail.importedAt, detail.importerName) : ''
    const day = formatDay(detail.date)
    const memo = detail.memo.trim()
    const checkNumber = detail.checkNumber.trim()
    return (
        <View className="gap-3">
            <Field id="date" label="Date" value={day} />
            <Field id="description" label="Description" value={detail.description} />
            <Field id="memo" label="Memo" value={memo} />
            <Field id="check" label="Check no." value={checkNumber} />
            <Field id="account" label="Account" value={detail.accountLabel} />
            <Field id="file" label="From file" value={source} />
            <Field id="imported" label="Imported" value={imported} />
        </View>
    )
}

function ActionContent({ drawer }: { drawer: DrawerModel }) {
    const action = drawer.action
    if (!action) return null
    if (drawer.isActionPending) {
        return (
            <>
                <ButtonSpinner />
                <ButtonText>{action.busyLabel}</ButtonText>
            </>
        )
    }
    return <ButtonText>{action.label}</ButtonText>
}

// Writers only, at the bottom of the drawer: the one move the transaction's status allows.
function TxnAction({ drawer }: { drawer: DrawerModel }) {
    const action = drawer.action
    if (!action) return null
    return (
        <View className="border-t border-border pt-4">
            <Button
                testID={action.testID}
                variant="outline"
                isDisabled={drawer.isActionDisabled}
                accessibilityHint={drawer.actionHint}
                onPress={drawer.onAction}
                style={ACTION_STYLE}
            >
                <ActionContent drawer={drawer} />
            </Button>
        </View>
    )
}

function TxnLoadError({ onRetry }: { onRetry: () => void }) {
    return (
        <View testID="bank-txn-error" accessibilityRole="alert" className="items-start gap-3">
            <Text className="text-sm text-foreground">Books could not load this transaction.</Text>
            <Button
                testID="bank-txn-retry"
                variant="outline"
                className="min-h-11"
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function TxnBody({
    drawer,
    currency,
    children,
}: {
    drawer: DrawerModel
    currency: string
    children?: ReactNode
}) {
    if (drawer.isError) return <TxnLoadError onRetry={drawer.onRetry} />
    if (!drawer.detail) {
        return (
            <View testID="bank-txn-loading" className="py-6">
                <LoadingState />
            </View>
        )
    }
    return (
        <View className="gap-4">
            <AmountBlock detail={drawer.detail} currency={currency} />
            <TxnFields detail={drawer.detail} />
            {children}
            <TxnAction drawer={drawer} />
        </View>
    )
}

// The facts of the pressed transaction, in the register's placement: inline beside the
// Banking page on a wide window, over it from the right on a tablet, a sheet on a phone. The
// `children` slot under the fields is where the match and categorize forms go.
export function BankTxnDrawer({
    drawer,
    currency,
    children,
}: {
    drawer: DrawerModel
    currency: string
    children?: ReactNode
}) {
    const closeColor = useThemeColor('foreground')
    const { contentClassName, ...placement } = drawerPlacement({
        isWide: drawer.isWide,
        isTablet: drawer.isTablet,
    })
    const isOpen = drawer.isLoading || drawer.isError || drawer.detail !== null
    const role = placement.presentation === 'inline' ? 'complementary' : 'dialog'
    const label = drawer.detail?.description || 'Transaction'
    return (
        <Drawer isOpen={isOpen} onClose={drawer.onClose} {...placement}>
            <DrawerBackdrop testID="bank-txn-drawer-backdrop" />
            <DrawerContent
                testID="bank-txn-drawer"
                role={role}
                accessibilityLabel={label}
                className={contentClassName}
            >
                <DrawerHeader className="border-b border-border">
                    <Text className="text-lg font-semibold text-foreground">Transaction</Text>
                    <DrawerCloseButton
                        accessibilityLabel="Close"
                        testID="bank-txn-close"
                        style={CLOSE_STYLE}
                    >
                        <X size={18} color={closeColor} />
                    </DrawerCloseButton>
                </DrawerHeader>
                <DrawerBody style={BODY_STYLE}>
                    <TxnBody drawer={drawer} currency={currency}>
                        {children}
                    </TxnBody>
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}
