import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import { Text, View } from 'react-native'
import { ProductPicker } from '../components/products/ProductPicker'
import { BUNDLE_KEEPS_TYPE } from '../lib/product-messages'
import { PRODUCT_TYPE_SELECT_OPTIONS } from '../lib/product-types'
import { HostSelect } from './account-fields'

// The `books:product` host components only it names (hosts.ts); the money and account
// fields are in money-fields.tsx and account-fields.tsx. The core cell draws each one's
// label and error.

// A bundle never changes type, so its type shows as text, not a select.
function BundleTypeText({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="form-input-type" className="gap-1">
            <Text className="py-2 text-base text-foreground">Bundle</Text>
            <Text className="text-xs text-muted-foreground">{BUNDLE_KEEPS_TYPE}</Text>
        </View>
    )
}

// Service and Non-inventory switch freely, and a change keeps every value.
function TypeSelect({ isVisible, ...props }: BuiltinFieldProps & { isVisible: boolean }) {
    if (!isVisible) return null
    return <HostSelect {...props} options={PRODUCT_TYPE_SELECT_OPTIONS} />
}

export function ProductTypeField(props: BuiltinFieldProps) {
    const isBundle = props.value === 'bundle'
    return (
        <>
            <BundleTypeText isVisible={isBundle} />
            <TypeSelect {...props} isVisible={!isBundle} />
        </>
    )
}

// One bundle item's product. Its test ids carry the row id, so a spec finds each row's
// picker.
export function BundleProductCell({
    fieldKey,
    label,
    value,
    onChange,
    disabled,
    table,
}: BuiltinFieldProps) {
    const productId = typeof value === 'string' ? value : ''
    const testID = `form-table-${fieldKey}-${table?.row.id ?? ''}-product`
    return (
        <ProductPicker
            value={productId}
            onChange={onChange}
            disabled={disabled}
            label={label}
            testID={testID}
        />
    )
}
