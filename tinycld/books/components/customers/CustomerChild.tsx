import { useLeaveGuard } from '@tinycld/core/components/forms-builder/use-leave-guard'
import type { FormDefinition } from '@tinycld/core/lib/forms/definition'
import { Button, ButtonText, ServerActionButton } from '@tinycld/core/ui/button'
import { ConfirmDialog } from '@tinycld/core/ui/ConfirmDialog'
import { FormRenderer } from '@tinycld/core/ui/forms'
import { View } from 'react-native'
import { type CustomerFormTarget, useCustomerForm } from '../../hooks/useCustomerForm'
import { useCustomerNavigation } from '../../hooks/useCustomerNavigation'
import { useDetailSurface } from '../../hooks/useDetailSurface'
import { customerFooter } from '../../lib/customer-display'
import { type DetailSurface, formRowClassFor } from '../../lib/detail-surface'
import { CustomerLoadingBody, CustomerSurface } from './CustomerSurface'

type CustomerFormState = ReturnType<typeof useCustomerForm>

interface CustomerFormBodyProps {
    state: CustomerFormState
    definition: FormDefinition
    surface: DetailSurface
}

// The core renderer owns the scroll view; each row is the surface's content column.
function CustomerFormBody({ state, definition, surface }: CustomerFormBodyProps) {
    return (
        <View className="flex-1 pt-4">
            <FormRenderer
                layout="sections"
                host={state.host}
                ui={state.ui}
                definition={definition}
                form={state.form}
                context={state.context}
                recordId={state.recordId}
                readOnly={state.readOnly}
                schemaRef={state.schemaRef}
                summary="root"
                scroll={{ rowClassName: formRowClassFor(surface) }}
                testID="customer-form"
            />
        </View>
    )
}

interface FooterButtonProps {
    isVisible: boolean
    onPress: () => void
}

function CancelButton({
    isVisible,
    onPress,
    isDisabled,
}: FooterButtonProps & { isDisabled: boolean }) {
    if (!isVisible) return null
    return (
        <Button
            testID="customer-cancel"
            variant="outline"
            isDisabled={isDisabled}
            onPress={onPress}
        >
            <ButtonText>Cancel</ButtonText>
        </Button>
    )
}

function CloseButton({ isVisible, onPress }: FooterButtonProps) {
    if (!isVisible) return null
    return (
        <Button testID="customer-close-footer" variant="outline" onPress={onPress}>
            <ButtonText>Close</ButtonText>
        </Button>
    )
}

interface SaveButtonProps extends FooterButtonProps {
    testID: string
    label: string
    variant: 'default' | 'outline'
    isDisabled: boolean
}

function SaveButton({ isVisible, onPress, testID, label, variant, isDisabled }: SaveButtonProps) {
    if (!isVisible) return null
    return (
        <ServerActionButton
            testID={testID}
            variant={variant}
            isDisabled={isDisabled}
            onPress={onPress}
        >
            <ButtonText>{label}</ButtonText>
        </ServerActionButton>
    )
}

interface CustomerFooterProps {
    state: CustomerFormState
    mode: CustomerFormTarget['mode']
    onLeave: () => void
}

function CustomerFooter({ state, mode, onLeave }: CustomerFooterProps) {
    const shown = customerFooter({ mode, canWrite: state.canWrite })
    return (
        <>
            <CloseButton isVisible={shown.close} onPress={onLeave} />
            <CancelButton isVisible={shown.cancel} onPress={onLeave} isDisabled={state.isSaving} />
            <SaveButton
                isVisible={shown.saveAndNew}
                onPress={state.saveAndNew}
                testID="customer-save-new"
                label="Save and new"
                variant="outline"
                isDisabled={state.isSaving}
            />
            <SaveButton
                isVisible={shown.save}
                onPress={state.save}
                testID="customer-save"
                label="Save"
                variant="default"
                isDisabled={state.isSaving}
            />
        </>
    )
}

// Asks before an unsaved form is left; Discard lets the held navigation go on.
function DiscardDialog({ guard }: { guard: ReturnType<typeof useLeaveGuard> }) {
    return (
        <ConfirmDialog
            isOpen={guard.isConfirming}
            onClose={guard.cancel}
            onConfirm={guard.discard}
            title="Discard changes?"
            message="This customer has changes that are not saved."
            confirmLabel="Discard"
            cancelLabel="Keep editing"
            isDestructive
            requiresServer={false}
        />
    )
}

/**
 * The open customer, new or existing. The one component that holds the form
 * (`useCustomerForm`), above the surface chrome, so nothing typed is lost when the
 * window crosses the panel width and the chrome changes around it.
 */
export function CustomerChild({ target }: { target: CustomerFormTarget }) {
    const navigation = useCustomerNavigation()
    const surface = useDetailSurface()
    const state = useCustomerForm(target)
    // Off while a save runs, so the `leave` that follows a saved write is not held. Cancel,
    // the back button and Escape are disabled for that time; the other ways out (the
    // package rail, the tab bar, the search palette, another list row, the browser's or
    // hardware back) still leave; a refusal then shows as a toast, and a success does not
    // navigate.
    const guard = useLeaveGuard(state.isDirty && !state.isSaving)
    const definition = state.isReady ? state.definition : undefined
    const body = definition ? (
        <CustomerFormBody state={state} definition={definition} surface={surface} />
    ) : (
        <CustomerLoadingBody />
    )
    const footer = definition ? (
        <CustomerFooter state={state} mode={target.mode} onLeave={navigation.leave} />
    ) : null
    return (
        <CustomerSurface
            surface={surface}
            title={state.title}
            onLeave={navigation.leave}
            isLeaveDisabled={state.isSaving}
            surfaceRef={state.surfaceRef}
            footer={footer}
        >
            {body}
            <DiscardDialog guard={guard} />
        </CustomerSurface>
    )
}
