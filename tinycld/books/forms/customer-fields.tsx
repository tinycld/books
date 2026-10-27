import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { Text, View } from 'react-native'
import { CustomerPicker } from '../components/customers/CustomerPicker'
import { AddressField } from '../components/forms/AddressField'
import { ContactInput } from '../components/forms/ContactInput'
import { PARENT_LOCKED_MESSAGE } from '../lib/customer-messages'
import { PHONE_MAX_LENGTH } from '../lib/host-value-schemas'

// The `books:customer` host components (hosts.ts names them). The core cell draws
// each one's label and error.

export function EmailField(props: BuiltinFieldProps) {
    return <ContactInput {...props} keyboardType="email-address" autoComplete="email" />
}

export function PhoneField(props: BuiltinFieldProps) {
    return (
        <ContactInput
            {...props}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={PHONE_MAX_LENGTH}
        />
    )
}

export function WebsiteField(props: BuiltinFieldProps) {
    return <ContactInput {...props} keyboardType="url" autoComplete="url" />
}

// A customer with sub-customers cannot become one (one level only), so its picker is
// locked. Any sub-customer counts, inactive ones too, as on the server. The picker
// stays locked until the check answers, so it never offers a choice the check then
// takes back; the help text waits for the answer. A failed check unlocks it (TanStack
// DB writes the failure to the console only) and the server's parent rule decides.
function useParentLock(customerId: string) {
    const [customersCollection] = useStore('books_customers')
    const { data, isReady, isError } = useLiveQuery({
        query: q =>
            customerId
                ? q
                      .from({ c: customersCollection })
                      .where(({ c }) => eq(c.parent, customerId))
                      // TanStack DB refuses a limit without an order.
                      .orderBy(({ c }) => c.id)
                      .limit(1)
                : null,
        queryKey: ['books-customer-has-subs', customerId],
    })
    const isExisting = customerId !== ''
    const hasSubCustomers = isExisting && (data?.length ?? 0) > 0
    const isChecking = isExisting && !isReady && !isError
    return { isLocked: hasSubCustomers || isChecking, hasSubCustomers }
}

function ParentLockedHelp({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="customer-parent-help" className="text-xs text-muted-foreground">
            {PARENT_LOCKED_MESSAGE}
        </Text>
    )
}

// The cell's spacing matches core TextInput's wrapper, so the gap below the picker is
// the gap below a text field.
export function ParentCustomerField({ value, onChange, recordId, disabled }: BuiltinFieldProps) {
    const selfId = recordId ?? ''
    const lock = useParentLock(selfId)
    const parentId = typeof value === 'string' ? value : ''
    return (
        <View className="gap-1.5 mb-3">
            <CustomerPicker
                value={parentId}
                onChange={onChange}
                selfId={selfId}
                disabled={disabled || lock.isLocked}
            />
            <ParentLockedHelp isVisible={lock.hasSubCustomers} />
        </View>
    )
}

export function BillingAddressField(props: BuiltinFieldProps) {
    return <AddressField {...props} variant="billing" />
}

export function ShippingAddressField(props: BuiltinFieldProps) {
    return <AddressField {...props} variant="shipping" />
}
