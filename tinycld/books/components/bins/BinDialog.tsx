import { LoadingState } from '@tinycld/core/components/LoadingState'
import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { FormErrorSummary, TextAreaInput, TextInput, Toggle } from '@tinycld/core/ui/form'
import type { RefObject } from 'react'
import { type TextInputInstance, View } from 'react-native'
import { type BinDialogModel, type EditedBin, useBinDialog } from '../../hooks/useBinDialog'
import { useFocusOnOpen } from '../../hooks/useFocusOnOpen'
import type { BinDialogTarget } from '../../lib/bin-list'
import { rootErrorOnly } from '../../lib/root-errors'
import { DialogLoadError } from '../taxes/DialogLoadError'

const BIN_LOAD_ERROR = 'Could not load the bin location.'

function InactiveField({ isVisible, dialog }: { isVisible: boolean; dialog: BinDialogModel }) {
    if (!isVisible) return null
    return (
        <Toggle
            name="inactive"
            control={dialog.form.control}
            label="Inactive"
            testID="bin-inactive"
        />
    )
}

function LoadingBody({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="bin-dialog-loading" className="py-6">
            <LoadingState />
        </View>
    )
}

// A failed load has nothing to save against, so the dialog offers no Save then.
function SaveButton({
    isVisible,
    isDisabled,
    onPress,
}: {
    isVisible: boolean
    isDisabled: boolean
    onPress: () => void
}) {
    if (!isVisible) return null
    return (
        <Dialog.ActionButton
            label="Save"
            onPress={onPress}
            isDisabled={isDisabled}
            shortcut={DIALOG_SUBMIT_SHORTCUT}
            testID="bin-save"
        />
    )
}

function BinFields({
    isVisible,
    dialog,
    nameRef,
}: {
    isVisible: boolean
    dialog: BinDialogModel
    nameRef: RefObject<TextInputInstance | null>
}) {
    if (!isVisible) return null
    const { control, formState } = dialog.form
    return (
        <View className="gap-1">
            <TextInput
                control={control}
                name="name"
                label="Name"
                testID="bin-name"
                inputRef={nameRef}
            />
            <TextAreaInput control={control} name="note" label="Note" testID="bin-note" />
            <InactiveField isVisible={dialog.isEdit} dialog={dialog} />
            <FormErrorSummary
                testID="bin-form-errors"
                errors={rootErrorOnly(formState.errors)}
                showFieldNames={false}
                isEnabled={dialog.summaryEnabled}
            />
        </View>
    )
}

/**
 * The bin dialog (`bin-dialog`; inventory-adjust spec §3.7), a core Dialog (a Sheet on a
 * phone): Name, Note and, on an edit, Inactive, with the focus in Name and Save on the
 * dialog's submit key. It draws by useBinDialog's state: the form, a loading edit, or a
 * failed load of the edited bin with Retry and no Save.
 */
export function BinDialog({ target, edited }: { target: BinDialogTarget; edited: EditedBin }) {
    const dialog = useBinDialog(target, edited)
    const { ref: nameRef } = useFocusOnOpen()
    // A close while the save runs would drop its refusal with the form.
    const close = () => {
        if (!dialog.isSaving) dialog.close()
    }
    const submit = () => dialog.submit()
    const isForm = dialog.state === 'form'
    const isLoading = dialog.state === 'loading'
    const isLoadError = dialog.state === 'load-error'
    if (dialog.state === 'gone') return null
    return (
        <Dialog
            isOpen
            onClose={close}
            title={dialog.title}
            size="sm"
            initialFocusRef={nameRef}
            testID="bin-dialog"
        >
            <Dialog.Body>
                <LoadingBody isVisible={isLoading} />
                <DialogLoadError
                    isVisible={isLoadError}
                    testIdPrefix="bin-load"
                    message={BIN_LOAD_ERROR}
                    onRetry={dialog.retryLoad}
                />
                <BinFields isVisible={isForm} dialog={dialog} nameRef={nameRef} />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={close} isDisabled={dialog.isSaving} />
                <SaveButton
                    isVisible={!isLoadError}
                    isDisabled={!dialog.canSave}
                    onPress={submit}
                />
            </Dialog.Footer>
        </Dialog>
    )
}
