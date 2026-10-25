import { Dialog } from '@tinycld/core/ui/dialog'
import { FormErrorSummary, SelectInput, TextAreaInput } from '@tinycld/core/ui/form'
import { View } from 'react-native'
import type { GrantableUser } from '../../hooks/useCloseOverrides'
import type { useOverridesPanel } from '../../hooks/useOverridesPanel'
import { LASTS_FOR_OPTIONS } from '../../lib/overrides'
import { rootErrorOnly } from '../../lib/root-errors'

interface GrantOverrideDialogProps {
    isVisible: boolean
    form: ReturnType<typeof useOverridesPanel>['grantForm']
    users: GrantableUser[]
    isSubmitting: boolean
    onSubmit: () => void
    onClose: () => void
}

// The core Dialog is a centered dialog on web and tablet and a bottom sheet on a phone, in one tree,
// so this component needs no breakpoint logic.
export function GrantOverrideDialog({
    isVisible,
    form,
    users,
    isSubmitting,
    onSubmit,
    onClose,
}: GrantOverrideDialogProps) {
    if (!isVisible) return null
    const { errors, isSubmitted } = form.formState
    const personOptions = users.map(user => ({ value: user.id, label: user.name }))
    return (
        <Dialog
            isOpen
            onClose={onClose}
            title="Grant an override"
            testID="books-settings-grant-dialog"
        >
            <Dialog.Body>
                <View className="gap-4">
                    <SelectInput
                        control={form.control}
                        name="user"
                        label="Person"
                        options={personOptions}
                        placeholder="Choose a person"
                        testID="books-settings-grant-user"
                    />
                    <TextAreaInput
                        control={form.control}
                        name="reason"
                        label="Reason"
                        testID="books-settings-grant-reason"
                    />
                    <SelectInput
                        control={form.control}
                        name="lasts"
                        label="Lasts for"
                        options={LASTS_FOR_OPTIONS}
                        testID="books-settings-grant-lasts"
                    />
                    <FormErrorSummary
                        testID="books-settings-grant-errors"
                        errors={rootErrorOnly(errors)}
                        showFieldNames={false}
                        isEnabled={isSubmitted}
                    />
                </View>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={onClose} isDisabled={isSubmitting} />
                <Dialog.ActionButton
                    label="Grant override"
                    onPress={onSubmit}
                    isDisabled={isSubmitting}
                    testID="books-settings-grant-submit"
                />
            </Dialog.Footer>
        </Dialog>
    )
}
