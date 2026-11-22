import { type Control, useController } from '@tinycld/core/ui/form'
import { Text, type TextInputInstance } from 'react-native'
import { amountError } from '../lib/opening-balances'
import type { OpeningFormValues } from '../lib/opening-balances-schema'
import { MoneyTextField } from './MoneyTextField'

interface MoneyInputProps {
    control: Control<OpeningFormValues>
    accountId: string
    // Number and name, so a screen reader can tell the inputs apart.
    accountLabel: string
    testID: string
    returnKeyType?: 'next' | 'done'
    onSubmitEditing?: () => void
    inputRef?: (node: TextInputInstance | null) => void
}

// Plain text in flow: the row or card renders it in its helper slot, in place of the
// helper line, so it never covers a neighbour and the item height stays fixed.
export function AmountError({ message, testID }: { message: string; testID: string }) {
    if (!message) return null
    return (
        <Text testID={testID} role="alert" className="text-xs text-danger">
            {message}
        </Text>
    )
}

// The message to show for one amount: a submit-time zod error, else the syntax
// check once the field was touched.
export function useAmountMessage(control: Control<OpeningFormValues>, accountId: string) {
    const { field, fieldState } = useController({
        name: `amounts.${accountId}`,
        control,
        defaultValue: '',
    })
    const text = field.value ?? ''
    const message =
        fieldState.error?.message ?? (fieldState.isTouched ? (amountError(text) ?? '') : '')
    return { field, text, message }
}

export function MoneyInput({
    control,
    accountId,
    accountLabel,
    testID,
    returnKeyType = 'next',
    onSubmitEditing,
    inputRef,
}: MoneyInputProps) {
    const { field, text, message } = useAmountMessage(control, accountId)
    const signToggle = {
        testID: `opening-sign-${accountId}`,
        accessibilityLabel: `Change sign for ${accountLabel}`,
    }

    return (
        <MoneyTextField
            inputRef={inputRef}
            testID={testID}
            accessibilityLabel={`Amount for ${accountLabel}`}
            value={text}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={message}
            onSubmitEditing={onSubmitEditing}
            returnKeyType={returnKeyType}
            signToggle={signToggle}
            marksNegative
        />
    )
}
