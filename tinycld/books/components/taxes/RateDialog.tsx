import { Dialog } from '@tinycld/core/ui/dialog'
import { FormErrorSummary, SelectInput, TextInput } from '@tinycld/core/ui/form'
import { useRef } from 'react'
import { Text, type TextInputInstance } from 'react-native'
import { useRateDialog } from '../../hooks/useRateDialog'
import { rootErrorOnly } from '../../lib/root-errors'
import { DialogLoadError } from './DialogLoadError'
import { PercentInput } from './PercentInput'

interface RateDialogProps {
    id: string | null
    agencyId: string
}

interface AgencySelectProps {
    isVisible: boolean
    dialog: ReturnType<typeof useRateDialog>
}

// A failed load of the agencies or the edited rate shows its error in this place instead.
function AgencySelect({ isVisible, dialog }: AgencySelectProps) {
    if (!isVisible) return null
    return (
        <SelectInput
            control={dialog.form.control}
            name="agency"
            label="Agency"
            options={dialog.agencyOptions}
            testID="tax-rate-form-agency"
        />
    )
}

export function RateDialog({ id, agencyId }: RateDialogProps) {
    const dialog = useRateDialog(id, agencyId)
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
            size="md"
            initialFocusRef={nameRef}
            testID="tax-rate-dialog"
        >
            <Dialog.Body>
                <TextInput
                    control={control}
                    name="name"
                    label="Name"
                    testID="tax-rate-form-name"
                    inputRef={nameRef}
                />
                <PercentInput
                    control={control}
                    name="rate"
                    label="Rate"
                    testID="tax-rate-form-percent"
                />
                {/* Keeps its line while blank, so the fields below do not jump as the
                    rate turns valid and invalid. */}
                <Text
                    testID="tax-rate-form-preview"
                    className="mb-3 text-xs text-muted-foreground"
                    style={{ minHeight: 16 }}
                >
                    {dialog.preview}
                </Text>
                <AgencySelect isVisible={!dialog.loadFailed} dialog={dialog} />
                <DialogLoadError
                    isVisible={dialog.loadFailed}
                    testIdPrefix="tax-rate-form-load"
                    onRetry={dialog.retryLoad}
                />
                <FormErrorSummary
                    testID="tax-rate-form-errors"
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
                    testID="tax-rate-form-save"
                />
            </Dialog.Footer>
        </Dialog>
    )
}
