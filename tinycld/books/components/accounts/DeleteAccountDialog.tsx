import { Dialog } from '@tinycld/core/ui/dialog'
import { Text } from 'react-native'
import type { useAccountActions } from '../../hooks/useAccountActions'
import type { AccountRow } from '../../hooks/useAccountsQuery'
import { useAccountUsage } from '../../hooks/useAccountUsage'
import { deleteBlockedMessage } from '../../lib/account-messages'

type Actions = ReturnType<typeof useAccountActions>

interface DeleteAccountDialogProps {
    account: AccountRow | null
    actions: Actions
    onClose: () => void
}

// The usage hook lives in the body so a closed dialog costs nothing. The
// mutation state belongs to the screen, which owns the one actions instance.
export function DeleteAccountDialog({ account, actions, onClose }: DeleteAccountDialogProps) {
    if (!account) return null
    return <DeleteAccountBody account={account} actions={actions} onClose={onClose} />
}

type Confirm = { label: string; isDestructive: boolean; isDisabled: boolean } | null

// An already-inactive account has nothing left to offer when it is blocked.
function confirmFor(isReady: boolean, blocked: string | null, isInactive: boolean): Confirm {
    if (!isReady) return { label: 'Checking...', isDestructive: false, isDisabled: true }
    if (!blocked) return { label: 'Delete', isDestructive: true, isDisabled: false }
    if (isInactive) return null
    return { label: 'Make inactive', isDestructive: false, isDisabled: false }
}

// An ignored call resolves with nothing done; only the account's own id counts.
async function madeInactive(actions: Actions, id: string) {
    const result = await actions.setInactive([id], true)
    return !result.failed && result.done.includes(id)
}

function DeleteAccountBody({
    account,
    actions,
    onClose,
}: DeleteAccountDialogProps & { account: AccountRow }) {
    const usage = useAccountUsage(account.id)
    const blocked = usage.isReady ? deleteBlockedMessage(usage) : null
    const confirm = confirmFor(usage.isReady, blocked, account.inactive)

    // A write in flight must finish before the dialog goes away.
    const dismiss = () => {
        if (!actions.isWorking) onClose()
    }

    const run = async () => {
        if (!usage.isReady) return
        const isDone = blocked
            ? await madeInactive(actions, account.id)
            : await actions.deleteAccount(account.id)
        if (isDone) onClose()
    }

    return (
        <Dialog
            isOpen
            onClose={dismiss}
            title={blocked ? "This account can't be deleted" : 'Delete account?'}
            hasCloseButton={false}
        >
            <Dialog.Body testID="delete-account-dialog-body">
                <BlockedExplanation reason={blocked} />
                <Text className="text-sm text-foreground">{account.name}</Text>
                <ActionError message={actions.actionError} />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={dismiss} isDisabled={actions.isWorking} />
                <ConfirmButton confirm={confirm} isWorking={actions.isWorking} onPress={run} />
            </Dialog.Footer>
        </Dialog>
    )
}

function ConfirmButton({
    confirm,
    isWorking,
    onPress,
}: {
    confirm: Confirm
    isWorking: boolean
    onPress: () => void
}) {
    if (!confirm) return null
    return (
        <Dialog.ActionButton
            label={confirm.label}
            onPress={onPress}
            isDisabled={isWorking || confirm.isDisabled}
            isDestructive={confirm.isDestructive}
        />
    )
}

function BlockedExplanation({ reason }: { reason: string | null }) {
    if (!reason) return null
    return (
        <>
            <Text className="text-sm font-medium text-foreground">{reason}</Text>
            <Text className="text-sm text-muted-foreground">
                It cannot be deleted. Make it inactive to hide it from lists.
            </Text>
        </>
    )
}

function ActionError({ message }: { message: string | null }) {
    if (!message) return null
    return (
        <Text accessibilityRole="alert" className="text-sm text-danger">
            {message}
        </Text>
    )
}
