import { ButtonText, ServerActionButton } from '@tinycld/core/ui/button'
import { Dialog } from '@tinycld/core/ui/dialog'
import { FormErrorSummary, SelectInput, TextInput, useController } from '@tinycld/core/ui/form'
import { Text, View } from 'react-native'
import { useAgencyDialog } from '../../hooks/useAgencyDialog'
import { useFocusOnOpen } from '../../hooks/useFocusOnOpen'
import { rootErrorOnly } from '../../lib/root-errors'
import { NO_LIABILITY_ACCOUNT } from '../../lib/tax-messages'
import { DialogLoadError } from './DialogLoadError'

type AgencyDialogState = ReturnType<typeof useAgencyDialog>

interface AccountPartProps {
    isVisible: boolean
    dialog: AgencyDialogState
}

// A stored account the list no longer offers (it became inactive) shows by name while
// no option matches it.
function AccountSelect({ isVisible, dialog }: AccountPartProps) {
    if (!isVisible) return null
    return (
        <SelectInput
            control={dialog.form.control}
            name="account"
            label="Liability account"
            options={dialog.accountOptions}
            placeholder={dialog.accountTriggerLabel}
            testID="tax-agency-form-account"
        />
    )
}

function AccountError({ dialog }: { dialog: AgencyDialogState }) {
    const { fieldState } = useController({ control: dialog.form.control, name: 'account' })
    const message = fieldState.error?.message
    if (!message) return null
    return <Text className="text-xs text-danger">{message}</Text>
}

// With no liability account in the chart there is nothing to pick: the dialog offers
// to create the usual one instead.
function NoAccountNote({ isVisible, dialog }: AccountPartProps) {
    if (!isVisible) return null
    return (
        <View testID="tax-agency-form-no-account" className="mb-3 gap-2">
            <Text className="text-sm font-semibold text-foreground">Liability account</Text>
            <Text className="text-sm text-muted-foreground">{NO_LIABILITY_ACCOUNT}</Text>
            <ServerActionButton
                testID="tax-agency-form-create-account"
                variant="outline"
                size="sm"
                className="self-start"
                style={{ minHeight: 44 }}
                isDisabled={dialog.isCreatingAccount}
                onPress={() => void dialog.createAccount()}
            >
                <ButtonText>Create Sales tax payable account</ButtonText>
            </ServerActionButton>
            <AccountError dialog={dialog} />
        </View>
    )
}

export function AgencyDialog({ id }: { id: string | null }) {
    const dialog = useAgencyDialog(id)
    const nameFocus = useFocusOnOpen()
    const { errors } = dialog.form.formState
    // A close while the save runs would drop its refusal with the form.
    const close = () => {
        if (!dialog.isSaving) dialog.close()
    }
    // A failed load of the chart or the edited agency shows its error where the account
    // picker would be.
    const showsSelect = dialog.hasLiabilityAccount && !dialog.loadFailed
    const showsNoAccountNote = !dialog.hasLiabilityAccount && !dialog.loadFailed
    return (
        <Dialog isOpen onClose={close} title={dialog.title} size="md" testID="tax-agency-dialog">
            <Dialog.Body>
                <TextInput
                    control={dialog.form.control}
                    name="name"
                    label="Name"
                    testID="tax-agency-form-name"
                    {...nameFocus}
                />
                <AccountSelect isVisible={showsSelect} dialog={dialog} />
                <NoAccountNote isVisible={showsNoAccountNote} dialog={dialog} />
                <DialogLoadError
                    isVisible={dialog.loadFailed}
                    testIdPrefix="tax-agency-form-load"
                    onRetry={dialog.retryLoad}
                />
                <FormErrorSummary
                    testID="tax-agency-form-errors"
                    errors={rootErrorOnly(errors)}
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
                    testID="tax-agency-form-save"
                />
            </Dialog.Footer>
        </Dialog>
    )
}
