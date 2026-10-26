import type { FormDefinition } from '@tinycld/core/lib/forms/definition'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { FormRenderer } from '@tinycld/core/ui/forms'
import { View } from 'react-native'
import { type CustomerFormTarget, useCustomerForm } from '../../hooks/useCustomerForm'
import { useCustomerNavigation } from '../../hooks/useCustomerNavigation'
import { useDetailSurface } from '../../hooks/useDetailSurface'
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

function CustomerFooter({ onCancel }: { onCancel: () => void }) {
    return (
        <Button testID="customer-cancel" variant="outline" onPress={onCancel}>
            <ButtonText>Cancel</ButtonText>
        </Button>
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
    const definition = state.isReady ? state.definition : undefined
    const body = definition ? (
        <CustomerFormBody state={state} definition={definition} surface={surface} />
    ) : (
        <CustomerLoadingBody />
    )
    return (
        <CustomerSurface
            surface={surface}
            title={state.title}
            onLeave={navigation.leave}
            footer={<CustomerFooter onCancel={navigation.leave} />}
        >
            {body}
        </CustomerSurface>
    )
}
