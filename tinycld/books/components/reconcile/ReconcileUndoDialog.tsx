import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonSpinner, ButtonText } from '@tinycld/core/ui/button'
import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { useIsFocused } from 'expo-router'
import { Text } from 'react-native'
import { type ReconcileUndoModel, useReconcileUndo } from '../../hooks/useReconcileUndo'
import { UNDO_TEXTS } from '../../lib/reconcile-history'
import { RefusalSummary } from '../entries/RefusalSummary'
import { DialogLoadError } from '../taxes/DialogLoadError'

// While the undo is sent: a disabled destructive button with the spinner, "Undoing…".
function UndoSubmit({ model }: { model: ReconcileUndoModel }) {
    if (model.isSending) {
        return (
            <Button testID="reconcile-undo-submit" size="sm" variant="destructive" isDisabled>
                <ButtonSpinner />
                <ButtonText>{UNDO_TEXTS.sending}</ButtonText>
            </Button>
        )
    }
    return (
        <Dialog.ActionButton
            label={UNDO_TEXTS.submit}
            onPress={model.onSubmit}
            isDestructive
            isDisabled={model.writes.isDisabled}
            shortcut={DIALOG_SUBMIT_SHORTCUT}
            testID="reconcile-undo-submit"
        />
    )
}

function AskBody({ model }: { model: ReconcileUndoModel }) {
    const text = model.texts?.text ?? ''
    return (
        <>
            <Dialog.Body>
                <Text testID="reconcile-undo-text" className="text-sm text-foreground">
                    {text}
                </Text>
                <RefusalSummary message={model.error} />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton
                    onPress={model.onClose}
                    isDisabled={model.isSending}
                    testID="reconcile-undo-cancel"
                />
                <UndoSubmit model={model} />
            </Dialog.Footer>
        </>
    )
}

// Another reconciliation of the account is in progress: no Undo button, a link to that one.
function BlockedBody({ model }: { model: ReconcileUndoModel }) {
    const text = model.texts?.text ?? ''
    return (
        <>
            <Dialog.Body>
                <Text testID="reconcile-undo-blocked" className="text-sm text-foreground">
                    {text}
                </Text>
                <Button
                    variant="link"
                    size="sm"
                    className="mt-3 self-start px-0"
                    testID="reconcile-undo-open"
                    onPress={model.onOpenBlocking}
                >
                    <ButtonText>{UNDO_TEXTS.openIt}</ButtonText>
                </Button>
            </Dialog.Body>
            <CloseFooter model={model} />
        </>
    )
}

function CloseFooter({ model }: { model: ReconcileUndoModel }) {
    return (
        <Dialog.Footer>
            <Dialog.CancelButton
                onPress={model.onClose}
                label={UNDO_TEXTS.close}
                testID="reconcile-undo-cancel"
            />
        </Dialog.Footer>
    )
}

// Loading, a load error with Retry, or a target that is no longer finished: only Close.
function OtherBody({ model }: { model: ReconcileUndoModel }) {
    const isLoading = model.state === 'loading'
    const isError = model.state === 'error'
    const isGone = model.state === 'gone'
    return (
        <>
            <Dialog.Body>
                <LoadingStateWhile isVisible={isLoading} />
                <DialogLoadError
                    isVisible={isError}
                    testIdPrefix="reconcile-undo"
                    message={UNDO_TEXTS.loadError}
                    onRetry={model.onRetry}
                />
                <GoneText isVisible={isGone} />
            </Dialog.Body>
            <CloseFooter model={model} />
        </>
    )
}

function LoadingStateWhile({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <LoadingState />
}

function GoneText({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="reconcile-undo-gone" className="text-sm text-foreground">
            {UNDO_TEXTS.gone}
        </Text>
    )
}

function UndoBody({ model }: { model: ReconcileUndoModel }) {
    if (model.state === 'ask') return <AskBody model={model} />
    if (model.state === 'blocked') return <BlockedBody model={model} />
    return <OtherBody model={model} />
}

/**
 * The undo dialog (reconciliation report spec §3 "Undo"; core Dialog, a sheet on a phone),
 * drawn on the focused screen only: the history stays mounted under a pushed summary, and
 * both mount this dialog. Its data and actions are useReconcileUndo's.
 */
export function ReconcileUndoDialog() {
    const model = useReconcileUndo()
    const isFocused = useIsFocused()
    if (model.state === 'closed' || !isFocused) return null
    return (
        <Dialog
            isOpen
            onClose={model.onClose}
            title={UNDO_TEXTS.title}
            testID="reconcile-undo-dialog"
            hasCloseButton={false}
        >
            <UndoBody model={model} />
        </Dialog>
    )
}
