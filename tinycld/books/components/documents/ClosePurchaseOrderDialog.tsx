import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { Text } from 'react-native'
import { PURCHASE_ORDER_MESSAGES } from '../../lib/document-texts'

export interface ClosePurchaseOrderDialogProps {
    // Open while the caller's Close is asked and still offered (the order is open and the
    // user a writing admin), or while its own Close runs.
    isVisible: boolean
    number: string
    // orderCloseBody: the open line count and the open amount.
    body: string
    isPending: boolean
    onConfirm(): void
    onCancel(): void
}

function ignore() {}

/**
 * The Close confirm of a purchase order (purchase order spec §3.6): a core Dialog titled
 * "Close purchase order 1004?", the open lines and amount, Cancel (Esc) and "Close purchase
 * order" (⌘↵). The confirm is idle while its Close runs and while writes are not available
 * (useServerActionState, as the read bar's writing actions); a refusal shows in a toast
 * (usePurchaseOrderStatus).
 */
export function ClosePurchaseOrderDialog({
    isVisible,
    number,
    body,
    isPending,
    onConfirm,
    onCancel,
}: ClosePurchaseOrderDialogProps) {
    const writes = useServerActionState()
    const isConfirmIdle = isPending || writes.isDisabled
    const title = PURCHASE_ORDER_MESSAGES.closeTitle.replace('%s', number)
    return (
        <Dialog
            isOpen={isVisible}
            onClose={isPending ? ignore : onCancel}
            title={title}
            testID="close-purchase-order-dialog"
            hasCloseButton={false}
        >
            <Dialog.Body>
                <Text className="text-sm text-foreground">{body}</Text>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={onCancel} isDisabled={isPending} />
                <Dialog.ActionButton
                    label={PURCHASE_ORDER_MESSAGES.closeAction}
                    onPress={isConfirmIdle ? ignore : onConfirm}
                    isDisabled={isConfirmIdle}
                    shortcut={DIALOG_SUBMIT_SHORTCUT}
                    testID="close-purchase-order-confirm"
                />
            </Dialog.Footer>
        </Dialog>
    )
}
