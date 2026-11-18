import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { Button, ButtonText, ServerActionButton } from '@tinycld/core/ui/button'
import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { autoFocusDataSet } from '@tinycld/core/ui/overlay/focus'
import { useButtonShortcut } from '@tinycld/core/ui/shortcut-button/useButtonShortcut'
import { Pressable, Text, View } from 'react-native'
import type { CreditApplicationRow } from '../../hooks/useCreditApplications'
import type { CreditRefundRow } from '../../hooks/useCreditRefunds'
import { useOpenDocument } from '../../hooks/useOpenDocument'
import { APPLY_CREDIT_MESSAGES } from '../../lib/apply-credit-schema'
import type { CreditUseRow } from '../../lib/credit-uses'
import { formatMoney } from '../../lib/money'
import { fillPaymentText } from '../../lib/payment-texts'
import { formatDay } from '../../lib/register-range'
import { BILL_KIND, VENDOR_CREDIT_KIND } from '../../lib/sales-document-kinds'
import { VENDOR_REFUND_FLOW } from '../../lib/vendor-refund-flow'
import { RefusalSummary } from '../entries/RefusalSummary'
import { ListBanner } from '../ListBanner'

const TAP = { minHeight: 44 }

// Core's marker of the element a dialog focuses when it opens (moveFocusIn).
const AUTOFOCUS = autoFocusDataSet({ autoFocus: true })

function ignore() {}

// What an application row names and opens: the bill on a vendor credit's Applied to block,
// the vendor credit on a bill's Payments block. The row's ids follow it:
// `<prefix>-application-<id>` / `<prefix>-application-remove-<id>` on the credit,
// `<prefix>-credit-<id>` / `<prefix>-credit-remove-<id>` on the bill.
const APPLICATION_TARGETS = {
    bill: {
        kind: BILL_KIND,
        noun: 'Bill',
        idSuffix: 'application',
        documentOf: (row: CreditApplicationRow) => ({ id: row.billId, number: row.billNumber }),
    },
    credit: {
        kind: VENDOR_CREDIT_KIND,
        noun: 'Vendor credit',
        idSuffix: 'credit',
        documentOf: (row: CreditApplicationRow) => ({
            id: row.creditId,
            number: row.creditNumber,
        }),
    },
} as const

export type ApplicationTarget = keyof typeof APPLICATION_TARGETS

interface ApplicationRowProps {
    application: CreditApplicationRow
    // The document the row names and opens (APPLICATION_TARGETS).
    target: ApplicationTarget
    currency: string
    testIdPrefix: string
    // A writer on a posted document: the row offers Remove.
    canRemove: boolean
    onRemove: (application: CreditApplicationRow) => void
}

function RemoveButton({
    isVisible,
    testID,
    onPress,
}: {
    isVisible: boolean
    testID: string
    onPress: () => void
}) {
    if (!isVisible) return null
    return (
        <Button testID={testID} variant="outline" size="sm" style={TAP} onPress={onPress}>
            <ButtonText>Remove</ButtonText>
        </Button>
    )
}

/**
 * One application: on a vendor credit's Applied to block "Bill 1003 · Nov 16, 2026 ·
 * $30.00", on a bill's Payments block "Vendor credit 1002 · Nov 16, 2026 · $30.00"; a link
 * that opens that document (back to its screen when it is below, else pushed), and Remove
 * for a writer on a posted document. Remove only opens the confirm, so it is a plain Button.
 */
export function ApplicationRow({
    application,
    target,
    currency,
    testIdPrefix,
    canRemove,
    onRemove,
}: ApplicationRowProps) {
    const named = APPLICATION_TARGETS[target]
    const document = named.documentOf(application)
    const open = useOpenDocument(named.kind, document.id)
    const amount = formatMoney(application.amount, currency)
    const day = formatDay(application.date)
    const text = `${named.noun} ${document.number} · ${day} · ${amount}`
    const remove = () => onRemove(application)
    const ids = {
        row: `${testIdPrefix}-${named.idSuffix}-${application.id}`,
        remove: `${testIdPrefix}-${named.idSuffix}-remove-${application.id}`,
    }
    return (
        <View testID={ids.row} className="flex-row flex-wrap items-center gap-3">
            <Pressable
                accessibilityRole="link"
                onPress={open}
                className="min-w-0 justify-center self-start"
                style={TAP}
            >
                <Text className="text-sm text-primary underline" numberOfLines={1}>
                    {text}
                </Text>
            </Pressable>
            <RemoveButton isVisible={canRemove} testID={ids.remove} onPress={remove} />
        </View>
    )
}

/**
 * One posted vendor refund on a vendor credit's Applied to block (vendor refund spec §3.9):
 * "Vendor refund 1001 · Nov 17, 2026 · $50.00", a link that opens the refund (back to its
 * screen when it is below, else pushed, as ApplicationRow), laid out as an application row.
 * It has no Remove: the refund is voided or edited on its own page. The row's id is
 * `<prefix>-refund-<refundId>`.
 */
function RefundUseRow({
    refund,
    currency,
    testIdPrefix,
}: {
    refund: CreditRefundRow
    currency: string
    testIdPrefix: string
}) {
    const open = useOpenDocument(VENDOR_REFUND_FLOW, refund.refundId)
    const amount = formatMoney(refund.amount, currency)
    const text = `Vendor refund ${refund.number} · ${formatDay(refund.date)} · ${amount}`
    return (
        <View
            testID={`${testIdPrefix}-refund-${refund.refundId}`}
            className="flex-row flex-wrap items-center gap-3"
        >
            <Pressable
                accessibilityRole="link"
                onPress={open}
                className="min-w-0 justify-center self-start"
                style={TAP}
            >
                <Text className="text-sm text-primary underline" numberOfLines={1}>
                    {text}
                </Text>
            </Pressable>
        </View>
    )
}

export type CreditUse = CreditUseRow<CreditApplicationRow, CreditRefundRow>

type UseRowProps = {
    use: CreditUse
    currency: string
    testIdPrefix: string
    canRemove: boolean
    onRemove: (application: CreditApplicationRow) => void
}

// A row of the block: an application (with Remove for a writer) or a refund (none).
function UseRow({ use, currency, testIdPrefix, canRemove, onRemove }: UseRowProps) {
    if (use.kind === 'refund') {
        return <RefundUseRow refund={use} currency={currency} testIdPrefix={testIdPrefix} />
    }
    return (
        <ApplicationRow
            application={use}
            target="bill"
            currency={currency}
            testIdPrefix={testIdPrefix}
            canRemove={canRemove && use.removable}
            onRemove={onRemove}
        />
    )
}

const APPLICATIONS_LOAD_FAILED = 'Books could not load where this credit is applied.'

interface DocumentApplicationsProps {
    // The applications and the posted refunds, in date order (creditUseRows).
    uses: readonly CreditUse[]
    isReady: boolean
    isError: boolean
    onRetry: () => void
    currency: string
    // `<testIdPrefix>-applications`, and each row's ids under it.
    testIdPrefix: string
    canRemove: boolean
    onRemove: (application: CreditApplicationRow) => void
}

/**
 * A vendor credit's Applied to block (vendor credit spec §3.9, vendor refund spec §3.9): one
 * row per application (ApplicationRow) and per posted vendor refund (RefundUseRow), oldest
 * date first, an application before a refund on one day. Nothing while the reads load or
 * when the credit has no use; a failed read shows its notice with Retry inside the block
 * and no rows, so it never reads as "nothing applied" (lesson 14).
 */
export function DocumentApplications({
    uses,
    isReady,
    isError,
    onRetry,
    currency,
    testIdPrefix,
    canRemove,
    onRemove,
}: DocumentApplicationsProps) {
    const isHidden = !isError && (!isReady || uses.length === 0)
    if (isHidden) return null
    const body = isError ? (
        <ListBanner
            testIdPrefix={`${testIdPrefix}-applications`}
            message={APPLICATIONS_LOAD_FAILED}
            onRetry={onRetry}
            isFlush
        />
    ) : (
        uses.map(use => (
            <UseRow
                key={`${use.kind}-${use.id}`}
                use={use}
                currency={currency}
                testIdPrefix={testIdPrefix}
                canRemove={canRemove}
                onRemove={onRemove}
            />
        ))
    )
    return (
        <View testID={`${testIdPrefix}-applications`} className="gap-1">
            <Text className="text-sm font-semibold text-foreground">Applied to</Text>
            {body}
        </View>
    )
}

// Remove: a ServerActionButton marked for the dialog's focus on open (web), so Enter
// confirms, as ⌘↵ does (core ConfirmDialog focuses its first button, Cancel).
function ConfirmRemoveButton({
    isPending,
    onConfirm,
}: {
    isPending: boolean
    onConfirm: () => void
}) {
    const writes = useWritesAvailable()
    const onPress = isPending ? ignore : onConfirm
    useButtonShortcut({
        label: 'Remove',
        shortcut: DIALOG_SUBMIT_SHORTCUT,
        isDisabled: isPending || !writes.available,
        onPress,
    })
    const reason = writes.available ? null : (
        <Text className="flex-1 text-xs text-muted-foreground">{writes.reason}</Text>
    )
    return (
        <>
            {reason}
            <ServerActionButton
                dataSet={AUTOFOCUS}
                testID="remove-application-confirm"
                size="sm"
                variant="destructive"
                isDisabled={isPending}
                onPress={onPress}
            >
                <ButtonText>Remove</ButtonText>
            </ServerActionButton>
        </>
    )
}

interface RemoveApplicationDialogProps {
    application: CreditApplicationRow | null
    // The application is still listed and Remove still offered, or its delete runs.
    isVisible: boolean
    currency: string
    isPending: boolean
    // The server's refusal, kept above this dialog so it survives the optimistic rollback.
    errorMessage: string | null
    onConfirm: () => void
    onCancel: () => void
}

/**
 * The confirm of Remove (vendor credit spec §3.9): "Remove this credit from Bill 1003? The
 * bill's balance goes up by $30.00 and the credit is unapplied again." Cancel (Esc) and
 * Remove (Enter, ⌘↵); a refusal shows in the dialog.
 */
export function RemoveApplicationDialog({
    application,
    isVisible,
    currency,
    isPending,
    errorMessage,
    onConfirm,
    onCancel,
}: RemoveApplicationDialogProps) {
    const amount = application ? formatMoney(application.amount, currency) : ''
    const body = fillPaymentText(
        APPLY_CREDIT_MESSAGES.removeBody,
        application?.billNumber ?? '',
        amount
    )
    const onClose = isPending ? ignore : onCancel
    const isOpen = isVisible && application !== null
    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title="Remove credit"
            testID="remove-application-dialog"
            hasCloseButton={false}
        >
            <Dialog.Body>
                <Text className="text-sm text-foreground">{body}</Text>
                <RefusalSummary message={errorMessage} />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton
                    onPress={onCancel}
                    isDisabled={isPending}
                    testID="remove-application-cancel"
                />
                <ConfirmRemoveButton isPending={isPending} onConfirm={onConfirm} />
            </Dialog.Footer>
        </Dialog>
    )
}
