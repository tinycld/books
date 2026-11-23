import { Dialog } from '@tinycld/core/ui/dialog'
import { Text } from 'react-native'
import type { BatchSend } from '../../hooks/useBatchSend'
import type { DocumentBatch } from '../../hooks/useDocumentBatch'
import type { DocumentRowActions } from '../../hooks/useDocumentRowActions'
import { SendDocumentDialog } from '../documents/send/SendDocumentDialog'
import { DeleteDraftDialog } from '../entries/DeleteDraftDialog'
import { VoidDialog } from '../entries/VoidDialog'
import { WriteOffDialog } from '../write-offs/WriteOffDialog'
import { BatchSendDialog } from './BatchSendDialog'

function ignore() {}

interface BatchProps {
    batch: DocumentBatch
    testIdPrefix: string
}

// The confirm (or, when the action applies to none, Close alone) of the batch dialog.
function BatchFooter({ batch, testIdPrefix }: BatchProps) {
    const confirmLabel = batch.copy?.confirmLabel ?? null
    if (confirmLabel === null) {
        return (
            <Dialog.Footer>
                <Dialog.CancelButton
                    testID={`${testIdPrefix}-batch-close`}
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
                testID={`${testIdPrefix}-batch-confirm`}
            />
        </Dialog.Footer>
    )
}

// One dialog per batch: what the action applies to and what it skips (`batchDialogCopy`).
function BatchDialog({ batch, testIdPrefix }: BatchProps) {
    const copy = batch.copy
    const onClose = batch.isRunning ? ignore : batch.close
    return (
        <Dialog
            isOpen={copy !== null}
            onClose={onClose}
            title={copy?.title ?? ''}
            testID={`${testIdPrefix}-batch-dialog`}
            hasCloseButton={false}
        >
            <Dialog.Body>
                <Text className="text-sm text-foreground">{copy?.body ?? ''}</Text>
            </Dialog.Body>
            <BatchFooter batch={batch} testIdPrefix={testIdPrefix} />
        </Dialog>
    )
}

// The row menu's Send… dialog: a writer's sales list only (no purchase row is sent-able).
function ListSendDialog({ isVisible, owner }: { isVisible: boolean; owner: string }) {
    if (!isVisible) return null
    return <SendDocumentDialog owner={owner} />
}

interface DocumentListDialogsProps {
    // The list area's test-id prefix (`<prefix>-batch-dialog`, `<prefix>-delete-dialog`, …).
    testIdPrefix: string
    rowActions: Pick<DocumentRowActions, 'voidDialog' | 'deleteDialog'>
    batch: DocumentBatch
    batchSend: BatchSend
    // The list screen's `useId()`: the row menu's Write off and Send… open their dialogs
    // for it.
    owner: string
    // A writer's sales list: the row menu offers Send….
    hasSend: boolean
}

/**
 * The list's dialogs, drawn once at the screen's root: a row menu's Void and Delete draft,
 * the Batch actions dialog, the batch Send dialog, and the row menu's Write off and Send…
 * dialogs. A Void or Delete draft refusal shows in the list's banner, not in the dialog,
 * which closes; the Write off, Send… and batch Send dialogs show their own refusals and
 * stay open (write-off spec §3.3, email-share spec §3.2, §3.3). The Void dialog keeps
 * `VoidDialog`'s own test ids.
 */
export function DocumentListDialogs({
    testIdPrefix,
    rowActions,
    batch,
    batchSend,
    owner,
    hasSend,
}: DocumentListDialogsProps) {
    return (
        <>
            <VoidDialog {...rowActions.voidDialog} />
            <DeleteDraftDialog
                {...rowActions.deleteDialog}
                testIdPrefix={`${testIdPrefix}-delete`}
            />
            <BatchDialog batch={batch} testIdPrefix={testIdPrefix} />
            <BatchSendDialog batch={batchSend} />
            <WriteOffDialog owner={owner} />
            <ListSendDialog isVisible={hasSend} owner={owner} />
        </>
    )
}
