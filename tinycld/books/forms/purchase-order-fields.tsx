import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import type { FormValues } from '@tinycld/core/lib/forms/logic'
import { TextAreaInput } from '@tinycld/core/ui/form'
import { useFormContext } from 'react-hook-form'
import { View } from 'react-native'
import { SHIP_TO_MAX_LENGTH, SHIP_TO_MAX_LINES } from '../lib/ship-to'

// The purchase order host's own header built-ins (books:purchase_order).

/**
 * Ship to (purchase order spec §3.3): where the vendor delivers, free text of up to 5
 * lines and 500 characters. The input binds to the document form's own field, as
 * VendorRefField does, so SHIP_TO_SCHEMA (forms/ui.ts `schemas`) and a server refusal
 * (setError on `ship_to`) give it core's error border, and the cell draws the error.
 * `maxLength` stops typing past the 500 characters the schema counts.
 */
export function ShipToField({ fieldKey, label, disabled }: BuiltinFieldProps) {
    const { control } = useFormContext<FormValues>()
    return (
        <View testID="purchase-order-ship-to">
            <TextAreaInput
                name={fieldKey}
                control={control}
                hideError
                numberOfLines={SHIP_TO_MAX_LINES}
                maxLength={SHIP_TO_MAX_LENGTH}
                testID={`form-input-${fieldKey}`}
                accessibilityLabel={label}
                editable={!disabled}
            />
        </View>
    )
}
