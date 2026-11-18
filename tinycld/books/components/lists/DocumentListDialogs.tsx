import { Dialog } from '@tinycld/core/ui/dialog'
import { Text } from 'react-native'
import type { DocumentBatch } from '../../hooks/useDocumentBatch'
import type { DocumentRowActions } from '../../hooks/useDocumentRowActions'
import { DeleteDraftDialog } from '../entries/DeleteDraftDialog'
import { VoidDialog } from '../entries/VoidDialog'

function ignore() {}

// The confirm (or, when the action applies to none, Close alone) of the batch dialog.
function BatchFooter({ batch }: { batch: DocumentBatch }) {
    const confirmLabel = batch.copy?.confirmLabel ?? null
    if (confirmLabel === null) {
        return (
            <Dialog.Footer>
                <Dialog.CancelButton
                    testID="sales-batch-close"
                    label="Close"
                    onPress={batch.close}
                />
            </Dialog.Footer>
        )
    }
    const confirm = batch.isRunning ? ignore : batch.confirm
    return (
        <Dialog.Footer>
            <Dialog.CancelButton onPress={batch.close} isDisabled={batch.isRunning} />
            <Dialog.ActionButton
                label={confirmLabel}
                onPress={confirm}
                isDisabled={batch.isRunning}
                isDestructive
                testID="sales-batch-confirm"
            />
        </Dialog.Footer>
    )
}

// One dialog per batch: what the action applies to and what it skips (`batchDialogCopy`).
function BatchDialog({ batch }: { batch: DocumentBatch }) {
    const copy = batch.copy
    const onClose = batch.isRunning ? ignore : batch.close
    return (
        <Dialog
            isOpen={copy !== null}
            onClose={onClose}
            title={copy?.title ?? ''}
            testID="sales-batch-dialog"
            hasCloseButton={false}
        >
            <Dialog.Body>
                <Text className="text-sm text-foreground">{copy?.body ?? ''}</Text>
            </Dialog.Body>
            <BatchFooter batch={batch} />
        </Dialog>
    )
}

interface DocumentListDialogsProps {
    rowActions: Pick<DocumentRowActions, 'voidDialog' | 'deleteDialog'>
    batch: DocumentBatch
}

/**
 * The Sales list's confirm dialogs, drawn once at the screen's root: a row menu's Void and
 * Delete draft, and the Batch actions dialog. A refusal shows in the list's banner, not in
 * the dialog, which closes.
 */
export function DocumentListDialogs({ rowActions, batch }: DocumentListDialogsProps) {
    return (
        <>
            <VoidDialog {...rowActions.voidDialog} />
            <DeleteDraftDialog {...rowActions.deleteDialog} testIdPrefix="sales-delete" />
            <BatchDialog batch={batch} />
        </>
    )
}
