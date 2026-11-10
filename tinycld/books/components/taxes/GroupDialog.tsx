import { Dialog } from '@tinycld/core/ui/dialog'
import { FormErrorSummary, MultiSelectInput, TextInput } from '@tinycld/core/ui/form'
import { useRef } from 'react'
import { Text, type TextInputInstance } from 'react-native'
import { useGroupDialog } from '../../hooks/useGroupDialog'
import { rootErrorOnly } from '../../lib/root-errors'
import { DialogLoadError } from './DialogLoadError'

interface GroupDialogProps {
    id: string | null
}

interface RateChecklistProps {
    isVisible: boolean
    dialog: ReturnType<typeof useGroupDialog>
}

// A failed load of the rates or the edited group shows its error in this place instead.
function RateChecklist({ isVisible, dialog }: RateChecklistProps) {
    if (!isVisible) return null
    return (
        <MultiSelectInput
            control={dialog.form.control}
            name="components"
            label="Rates"
            options={dialog.options}
            hint="Choose two to ten rates."
        />
    )
}

export function GroupDialog({ id }: GroupDialogProps) {
    const dialog = useGroupDialog(id)
    const nameRef = useRef<TextInputInstance>(null)
    const { control, formState } = dialog.form
    // A close while the save runs would drop its refusal with the form.
    const close = () => {
        if (!dialog.isSaving) dialog.close()
    }
    return (
        <Dialog
            isOpen
            onClose={close}
            title={dialog.title}
            size="lg"
            initialFocusRef={nameRef}
            testID="tax-group-dialog"
        >
            <Dialog.Body>
                <TextInput
                    control={control}
                    name="name"
                    label="Name"
                    testID="tax-group-form-name"
                    inputRef={nameRef}
                />
                <RateChecklist isVisible={!dialog.loadFailed} dialog={dialog} />
                <DialogLoadError
                    isVisible={dialog.loadFailed}
                    testIdPrefix="tax-group-form-load"
                    onRetry={dialog.retryLoad}
                />
                {/* Keeps its line while no rate is checked, so the footer does not jump
                    as the first rate is checked. */}
                <Text
                    testID="tax-group-form-preview"
                    className="mb-3 text-sm text-foreground"
                    style={{ minHeight: 20 }}
                >
                    {dialog.combined}
                </Text>
                <FormErrorSummary
                    testID="tax-group-form-errors"
                    errors={rootErrorOnly(formState.errors)}
                    showFieldNames={false}
                    isEnabled={dialog.summaryEnabled}
                />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={close} isDisabled={dialog.isSaving} />
                <Dialog.ActionButton
                    label={dialog.saveLabel}
                    onPress={() => void dialog.submit()}
                    isDisabled={!dialog.canSave}
                    testID="tax-group-form-save"
                />
            </Dialog.Footer>
        </Dialog>
    )
}
