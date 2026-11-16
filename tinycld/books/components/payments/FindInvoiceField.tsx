import { TextInput, useForm, zodResolver } from '@tinycld/core/ui/form'
import { useState } from 'react'
import { useWatch } from 'react-hook-form'
import { View } from 'react-native'
import { useFindInvoice } from '../../hooks/useFindInvoice'
import type { OutstandingRow } from '../../lib/payment-allocation'
import { type FindResult, type FindValues, findInvoiceSchema } from '../../lib/payment-find'
import { fillPaymentText, PAYMENT_MESSAGES } from '../../lib/payment-texts'
import { FieldError } from './PaymentMoneyField'

const FIND_WIDE = { width: 260 }

// The last lookup that did not pick: the number it looked up and what it came to.
type LookupOutcome = { number: string; result: FindResult }

// The message a lookup leaves under the field; '' for a pick.
function outcomeMessage(outcome: LookupOutcome | null): string {
    if (outcome === null) return ''
    const { number, result } = outcome
    if (result.kind === 'miss') return fillPaymentText(PAYMENT_MESSAGES.findMiss, number)
    if (result.kind === 'failed') return fillPaymentText(PAYMENT_MESSAGES.findFailed, number)
    if (result.kind === 'inactive') {
        return fillPaymentText(PAYMENT_MESSAGES.customerInactive, result.customerName)
    }
    return ''
}

/**
 * The state of Find invoice no. (spec §3.5): its text, which filters the listed rows while a
 * customer is chosen, and, with no customer, the lookup that Enter runs. The lookup's last
 * answer is UI state, not a form error: typing clears it, and it is drawn only while no
 * customer is chosen. `clear` empties the field; the form's customer pick handlers call it
 * when the customer changes, so an old lookup text never becomes a hidden filter.
 */
export function useFindInvoiceField({
    customer,
    getCustomer,
    onPicked,
}: {
    // The form's customer as drawn, and as it is now (read when a lookup answers).
    customer: string
    getCustomer: () => string
    onPicked: (invoice: OutstandingRow, customer: string) => void
}) {
    const form = useForm<FindValues>({
        defaultValues: { find: '' },
        resolver: zodResolver(findInvoiceSchema),
    })
    const { control, getValues, handleSubmit, reset } = form
    const text = useWatch({ control, name: 'find' })
    const [outcome, setOutcome] = useState<LookupOutcome | null>(null)
    const { find } = useFindInvoice()

    const clear = () => {
        reset({ find: '' })
        setOutcome(null)
    }

    const lookup = async (values: FindValues) => {
        const number = values.find.trim()
        // An empty lookup does nothing (the quick-input exception of the style guide).
        if (number === '') return
        const result = await find(number)
        // The user changed the text, or the form got a customer, while the lookup ran.
        if (getValues('find').trim() !== number || getCustomer() !== '') return
        if (result.kind === 'picked') {
            clear()
            onPicked(result.invoice, result.customer)
            return
        }
        setOutcome({ number, result })
    }

    const submit = () => {
        if (getCustomer() !== '') return
        void handleSubmit(lookup)()
    }

    const message = customer === '' ? outcomeMessage(outcome) : ''
    const filterText = customer === '' ? '' : text
    return { control, message, filterText, submit, clear, clearMessage: () => setOutcome(null) }
}

export type FindInvoiceFieldState = ReturnType<typeof useFindInvoiceField>

interface FindInvoiceFieldProps {
    field: FindInvoiceFieldState
    isFullWidth: boolean
    // A save runs: the field waits for it.
    isDisabled: boolean
}

// Find invoice no.: a Tab stop after Amount received, before the rows. Enter (native: the
// return key) runs the lookup while no customer is chosen.
export function FindInvoiceField({ field, isFullWidth, isDisabled }: FindInvoiceFieldProps) {
    const style = isFullWidth ? undefined : FIND_WIDE
    return (
        <View style={style}>
            <TextInput
                name="find"
                control={field.control}
                label="Find invoice no."
                placeholder="Invoice no."
                testID="payment-find"
                editable={!isDisabled}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                blurOnSubmit={false}
                onSubmitEditing={field.submit}
                onValueChange={field.clearMessage}
                wrapperProps={{ className: 'gap-1.5' }}
            />
            <FieldError message={field.message} testID="payment-find-miss" />
        </View>
    )
}
