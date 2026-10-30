import { Dialog } from '@tinycld/core/ui/dialog'
import { Text } from 'react-native'

// `key` names the line's role, since two lines can carry the same text and tone.
export type DeleteDialogLine = {
    key: string
    text: string
    tone: 'title' | 'muted' | 'plain' | 'error'
}

export type DeleteDialogConfirm = { testID: string; label: string; isDestructive: boolean } | null

interface DeleteRecordDialogProps {
    testIdPrefix: string
    title: string
    lines: readonly DeleteDialogLine[]
    confirm: DeleteDialogConfirm
    closeLabel: string
    // A write is in flight; it must finish before the dialog goes away.
    isWorking: boolean
    onClose: () => void
    // Resolves to whether the write is done; the dialog closes when it is.
    onConfirm: () => Promise<boolean>
}

const TONE_CLASS: Record<DeleteDialogLine['tone'], string> = {
    title: 'text-sm font-medium text-foreground',
    muted: 'text-sm text-muted-foreground',
    plain: 'text-sm text-foreground',
    error: 'text-sm text-danger',
}

function Line({ line }: { line: DeleteDialogLine }) {
    const role = line.tone === 'error' ? 'alert' : undefined
    return (
        <Text accessibilityRole={role} className={TONE_CLASS[line.tone]}>
            {line.text}
        </Text>
    )
}

export function DeleteRecordDialog({
    testIdPrefix,
    title,
    lines,
    confirm,
    closeLabel,
    isWorking,
    onClose,
    onConfirm,
}: DeleteRecordDialogProps) {
    const body = lines.map(line => <Line key={line.key} line={line} />)

    const dismiss = () => {
        if (!isWorking) onClose()
    }

    const run = async () => {
        if (await onConfirm()) onClose()
    }

    return (
        <Dialog
            isOpen
            onClose={dismiss}
            title={title}
            hasCloseButton={false}
            testID={`${testIdPrefix}-dialog`}
        >
            <Dialog.Body testID={`${testIdPrefix}-dialog-body`}>{body}</Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton
                    label={closeLabel}
                    onPress={dismiss}
                    isDisabled={isWorking}
                    testID={`${testIdPrefix}-close`}
                />
                <ConfirmButton confirm={confirm} isDisabled={isWorking} onPress={run} />
            </Dialog.Footer>
        </Dialog>
    )
}

function ConfirmButton({
    confirm,
    isDisabled,
    onPress,
}: {
    confirm: DeleteDialogConfirm
    isDisabled: boolean
    onPress: () => void
}) {
    if (!confirm) return null
    return (
        <Dialog.ActionButton
            testID={confirm.testID}
            label={confirm.label}
            onPress={onPress}
            isDisabled={isDisabled}
            isDestructive={confirm.isDestructive}
        />
    )
}
