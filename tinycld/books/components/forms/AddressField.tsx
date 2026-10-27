import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { type Control, TextInput, Toggle, z } from '@tinycld/core/ui/form'
import { View, type ViewProps } from 'react-native'
import {
    ADDRESS_PARTS,
    type AddressPart,
    addressPartsSchema,
    type CustomerAddress,
    EMPTY_ADDRESS,
} from '../../lib/address'
import { shippingValueSchema } from '../../lib/host-value-schemas'
import { useHostValueForm } from './use-host-value-form'

interface AddressFieldProps {
    fieldKey: string
    value: unknown
    onChange: (value: unknown) => void
    disabled: boolean
    variant: 'billing' | 'shipping'
}

// The local form's values: the six parts, and for shipping the "Same as billing" toggle.
type AddressValues = CustomerAddress & { same?: boolean }

const PART_LABELS: Record<AddressPart, string> = {
    line1: 'Street',
    line2: 'Street line 2',
    city: 'City',
    region: 'State or region',
    postal_code: 'Postal code',
    country: 'Country',
}

// Only the parts: the toggle is not part of the stored address.
function partsOf(values: AddressValues): CustomerAddress {
    const parts = { ...EMPTY_ADDRESS }
    for (const part of ADDRESS_PARTS) parts[part] = values[part] ?? ''
    return parts
}

// The stored shape with no length rule: a part typed past the server's limit comes
// back in the host value, and reading it must keep it in its input with its error.
const typedAddressSchema = z.object({
    line1: z.string(),
    line2: z.string(),
    city: z.string(),
    region: z.string(),
    postal_code: z.string(),
    country: z.string(),
} satisfies Record<AddressPart, z.ZodString>)

function addressOf(value: unknown): CustomerAddress {
    const parsed = typedAddressSchema.safeParse(value)
    return parsed.success ? parsed.data : EMPTY_ADDRESS
}

// An all-empty billing address is stored as null, the value a new customer starts with
// (useCustomerForm seeds it), so typing a part and deleting it leaves the stored value
// unchanged.
function billingValueOf(parts: CustomerAddress): CustomerAddress | null {
    return ADDRESS_PARTS.every(name => parts[name] === '') ? null : parts
}

interface PartInputProps {
    fieldKey: string
    part: AddressPart
    control: Control<AddressValues>
    disabled: boolean
    onValueChange: () => void
    wrapperProps?: ViewProps
}

// Shows its own length error: the cell holds one error for the whole address, which
// cannot say which part is too long.
function PartInput({
    fieldKey,
    part,
    control,
    disabled,
    onValueChange,
    wrapperProps,
}: PartInputProps) {
    return (
        <TextInput
            name={part}
            control={control}
            placeholder={PART_LABELS[part]}
            accessibilityLabel={PART_LABELS[part]}
            testID={`form-input-${fieldKey}-${part}`}
            editable={!disabled}
            onValueChange={onValueChange}
            wrapperProps={wrapperProps}
        />
    )
}

const SHARED_LINE_PART: ViewProps = { style: { flex: 1, minWidth: 0 } }

// City, State or region and Postal code share a line from the tablet breakpoint up,
// where the panel and the page are both at least 440 px wide. No layout measurement.
function CityLine(props: Omit<PartInputProps, 'part' | 'wrapperProps'>) {
    const isShared = useBreakpoint() !== 'mobile'
    const className = isShared ? 'flex-row gap-2' : undefined
    const wrapperProps = isShared ? SHARED_LINE_PART : undefined
    return (
        <View className={className}>
            <PartInput {...props} part="city" wrapperProps={wrapperProps} />
            <PartInput {...props} part="region" wrapperProps={wrapperProps} />
            <PartInput {...props} part="postal_code" wrapperProps={wrapperProps} />
        </View>
    )
}

interface AddressBlockProps extends Omit<PartInputProps, 'part' | 'wrapperProps'> {
    isVisible: boolean
}

function AddressBlock({ isVisible, ...props }: AddressBlockProps) {
    if (!isVisible) return null
    return (
        <View testID={`address-${props.fieldKey}`}>
            <PartInput {...props} part="line1" />
            <PartInput {...props} part="line2" />
            <CityLine {...props} />
            <PartInput {...props} part="country" />
        </View>
    )
}

interface SameToggleProps {
    control: Control<AddressValues>
    disabled: boolean
    isVisible: boolean
    onValueChange: (same: boolean) => void
}

function SameAsBillingToggle({ control, disabled, isVisible, onValueChange }: SameToggleProps) {
    if (!isVisible) return null
    return (
        <Toggle
            name="same"
            control={control}
            label="Same as billing address"
            testID="form-input-shipping_address-same"
            disabled={disabled}
            onValueChange={onValueChange}
        />
    )
}

// A field's variant never changes, so the schema and the value shape stay the same
// for the life of the form.
function useAddressForm(value: unknown, variant: AddressFieldProps['variant']) {
    const parts = addressOf(value)
    const isShipping = variant === 'shipping'
    const schema = isShipping ? shippingValueSchema : addressPartsSchema
    // A stored null means the shipping address is the billing address.
    const values: AddressValues = isShipping ? { ...parts, same: value === null } : parts
    return useHostValueForm<AddressValues>(schema, values)
}

/**
 * Billing and shipping address: Street, Street line 2, City, State or region, Postal
 * code and Country. The shipping variant starts folded behind "Same as billing
 * address"; while that is on, the stored value is null and the inputs are hidden.
 */
export function AddressField({ fieldKey, value, onChange, disabled, variant }: AddressFieldProps) {
    const form = useAddressForm(value, variant)
    const isShipping = variant === 'shipping'
    const isSame = isShipping && value === null
    const sendParts = () => {
        const parts = partsOf(form.getValues())
        onChange(isShipping ? parts : billingValueOf(parts))
    }
    const sendSame = (same: boolean) => onChange(same ? null : EMPTY_ADDRESS)
    return (
        <View>
            <SameAsBillingToggle
                control={form.control}
                disabled={disabled}
                isVisible={isShipping}
                onValueChange={sendSame}
            />
            <AddressBlock
                fieldKey={fieldKey}
                control={form.control}
                disabled={disabled}
                onValueChange={sendParts}
                isVisible={!isSame}
            />
        </View>
    )
}
