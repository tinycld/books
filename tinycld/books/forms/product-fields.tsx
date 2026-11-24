import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import { Text, View } from 'react-native'
import { ProductPicker } from '../components/products/ProductPicker'
import {
    type FixedProductType,
    fixedProductType,
    PRODUCT_TYPE_SELECT_OPTIONS,
} from '../lib/product-types'
import { HostSelect } from './account-fields'

// The `books:product` host components only it names (hosts.ts); the money and account
// fields are in money-fields.tsx and account-fields.tsx. The core cell draws each one's
// label and error.

// A bundle and an Inventory item never change type, so the type shows as text, not a
// select.
function FixedTypeText({ fixed }: { fixed: FixedProductType | null }) {
    if (fixed === null) return null
    return (
        <View testID="form-input-type" className="gap-1">
            <Text className="py-2 text-base text-foreground">{fixed.label}</Text>
            <Text className="text-xs text-muted-foreground">{fixed.note}</Text>
        </View>
    )
}

// Service and Non-inventory switch freely, and a change keeps every value.
function TypeSelect({ isVisible, ...props }: BuiltinFieldProps & { isVisible: boolean }) {
    if (!isVisible) return null
    return <HostSelect {...props} options={PRODUCT_TYPE_SELECT_OPTIONS} />
}

export function ProductTypeField(props: BuiltinFieldProps) {
    const fixed = fixedProductType(props.value)
    return (
        <>
            <FixedTypeText fixed={fixed} />
            <TypeSelect {...props} isVisible={fixed === null} />
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
