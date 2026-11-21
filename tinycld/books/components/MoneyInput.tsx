import { type Control, useController } from '@tinycld/core/ui/form'
import { Pressable, Text, type TextInputInstance, View } from 'react-native'
import { amountCents, amountError } from '../lib/opening-balances'
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

    const flipSign = () => {
        const trimmed = text.trim()
        if (trimmed === '' || amountCents(text) === null) return
        field.onChange(trimmed.startsWith('-') ? trimmed.slice(1) : `-${trimmed}`)
    }

    return (
        <View className="relative" style={{ minHeight: 44 }}>
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
                hasPrefix
                marksNegative
            />
            <Pressable
                testID={`opening-sign-${accountId}`}
                accessibilityRole="button"
                accessibilityLabel={`Change sign for ${accountLabel}`}
                onPress={flipSign}
                className="absolute left-0 top-0 items-center justify-center"
                style={{ width: 44, height: 44 }}
            >
                <Text className="text-base text-muted-foreground">±</Text>
            </Pressable>
        </View>
    )
}
