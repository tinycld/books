import { Button, ButtonSpinner, ButtonText } from '@tinycld/core/ui/button'
import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { Text, View } from 'react-native'
import { type CategorizeChosenModel, useCategorizeChosen } from '../../../hooks/useCategorizeChosen'
import type { ReviewBatch } from '../../../hooks/useReviewBatch'
import type { ReviewTabModel } from '../../../hooks/useReviewTab'
import { useBankingUIStore } from '../../../stores/banking-ui-store'
import { CloseOnMount } from '../CloseOnMount'
import { CategorizeAccountPicker } from './CategorizeAccountPicker'
import { PayeePicker } from './PayeePicker'

// ShortcutButton has no spinner, so while the run is sent a disabled Button with core
// ButtonSpinner takes the action's place (and ⌘↵ is not registered then).
function DialogAction({ model }: { model: CategorizeChosenModel }) {
    if (model.isRunning) {
        return (
            <Button testID="bank-categorize-dialog-confirm" size="sm" isDisabled>
                <ButtonSpinner />
                <ButtonText>Categorizing…</ButtonText>
            </Button>
        )
    }
    return (
        <Dialog.ActionButton
            label="Categorize"
            shortcut={DIALOG_SUBMIT_SHORTCUT}
            onPress={model.onSubmit}
            isDisabled={model.isSubmitDisabled}
            testID="bank-categorize-dialog-confirm"
        />
    )
}

function OpenCategorizeChosenDialog({ model }: { model: CategorizeChosenModel }) {
    const { account, payee } = model
    return (
        <Dialog
            isOpen
            onClose={model.onClose}
            title={model.title}
            testID="bank-categorize-dialog"
            initialFocusRef={model.focusRef}
        >
            <Dialog.Body>
                <View className="gap-3">
                    <Text
                        testID="bank-categorize-dialog-sums"
                        className="text-sm tabular-nums text-muted-foreground"
                    >
                        {model.sums}
                    </Text>
                    <CategorizeAccountPicker
                        label="Account"
                        testID="bank-categorize-dialog-account"
                        value={account.value}
                        onChange={account.onChange}
                        errorText={account.errorText}
                        options={account.options}
                        state={account.state}
                        onRetry={account.onRetry}
                        isDisabled={model.isRunning}
                        takesFocus={false}
                        fieldRef={account.fieldRef}
                    />
                    <PayeePicker
                        read={payee.read}
                        value={payee.value}
                        onChange={payee.onChange}
                        isDisabled={model.isRunning}
                        testID="bank-categorize-dialog-payee"
                    />
                </View>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton
                    onPress={model.onClose}
                    isDisabled={model.isRunning}
                    testID="bank-categorize-dialog-cancel"
                />
                <DialogAction model={model} />
            </Dialog.Footer>
        </Dialog>
    )
}

type DialogHostProps = {
    tabModel: ReviewTabModel
    connectionAccountId: string
    batch: ReviewBatch
}

// Mounted for one open of the dialog, so its form and its kept choice start fresh each
// time. A choice that is empty when it opens (the rows left the list) closes it.
function CategorizeChosenHost({ tabModel, connectionAccountId, batch }: DialogHostProps) {
    const closeDialog = useBankingUIStore(s => s.closeDialog)
    const model = useCategorizeChosen({
        choice: tabModel.categorizeChoice,
        onCategorizeChosen: tabModel.onCategorizeChosen,
        connectionAccountId,
        batch,
    })
    if (!model.hasRows) return <CloseOnMount onClose={closeDialog} />
    return <OpenCategorizeChosenDialog model={model} />
}

// The selection bar's Categorize dialog (For review, writers): a core Dialog (core's sheet
// on a phone) with the sums of the chosen rows, Account, Payee, Cancel and Categorize
// (⌘↵). It draws while the banking UI store names it and the tab offers the action.
export function CategorizeChosenDialog({
    isVisible,
    ...props
}: DialogHostProps & { isVisible: boolean }) {
    const dialog = useBankingUIStore(s => s.dialog)
    const isOpen = isVisible && dialog.kind === 'categorize-chosen'
    if (!isOpen) return null
    return <CategorizeChosenHost {...props} />
}
