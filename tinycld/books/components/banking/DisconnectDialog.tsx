import { Dialog } from '@tinycld/core/ui/dialog'
import { useState } from 'react'
import { Text } from 'react-native'
import type { BankConnectionRow } from '../../hooks/useBankConnections'
import { useDisconnectConnection } from '../../hooks/useDisconnectConnection'
import { connectionLabel, disconnectBody } from '../../lib/bank-connections'
import { CloseOnMount } from './CloseOnMount'

interface DisconnectDialogProps {
    connection: BankConnectionRow
    fileIds: readonly string[]
    isGone: boolean
    onDone(): void
    onClose(): void
}

function ignore() {}

function DisconnectRefusal({ message }: { message: string | null }) {
    if (!message) return null
    return (
        <Text
            testID="bank-disconnect-error"
            accessibilityRole="alert"
            className="text-sm text-danger"
        >
            {message}
        </Text>
    )
}

// The delete is optimistic: the connection leaves the page's rows before the server
// answers, so the dialog keeps the row it opened with (`connection`) and is told by
// `isGone` that the live row is missing. It closes itself for a missing row only until
// the user confirms; after that a refusal brings the row back and shows here.
export function DisconnectDialog({
    connection,
    fileIds,
    isGone,
    onDone,
    onClose,
}: DisconnectDialogProps) {
    const { confirm, isPending, refusal } = useDisconnectConnection({
        connection,
        fileIds,
        onDone,
    })
    const [isConfirmed, setConfirmed] = useState(false)
    if (isGone && !isConfirmed) return <CloseOnMount onClose={onClose} />
    const onConfirm = () => {
        setConfirmed(true)
        confirm()
    }
    const label = connectionLabel(connection.accountNumber, connection.accountName)
    return (
        <Dialog
            isOpen
            onClose={isPending ? ignore : onClose}
            title={`Disconnect ${label}?`}
            testID="bank-disconnect-dialog"
        >
            <Dialog.Body>
                <Text className="text-sm text-foreground">
                    {disconnectBody(connection.waitingCount)}
                </Text>
                <DisconnectRefusal message={refusal} />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton
                    onPress={onClose}
                    isDisabled={isPending}
                    testID="bank-disconnect-dialog-cancel"
                />
                <Dialog.ActionButton
                    label="Disconnect"
                    onPress={onConfirm}
                    isDisabled={isPending}
                    isDestructive
                    testID="bank-disconnect-dialog-confirm"
                />
            </Dialog.Footer>
        </Dialog>
    )
}
