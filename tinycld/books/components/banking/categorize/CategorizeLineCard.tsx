import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { type Control, TextInput, useController } from '@tinycld/core/ui/form'
import { X } from 'lucide-react-native'
import { useCallback } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { BankCategorizeModel, SplitLinesModel } from '../../../hooks/useBankCategorize'
import { type CategorizeFormValues, LINE_MEMO_MAX } from '../../../lib/bank-categorize'
import { MoneyTextField } from '../../MoneyTextField'
import { CategorizeAccountPicker } from './CategorizeAccountPicker'

const AMOUNT_WIDTH = 112
const TOUCH_STYLE = { minWidth: 44, minHeight: 44 }
const AMOUNT_BOX_STYLE = { width: AMOUNT_WIDTH }
const LINE_MEMO_WRAPPER = { className: 'min-w-0 flex-1 gap-1.5' } as const
const LINE_MEMO_WRAPPER_DISABLED = {
    className: 'min-w-0 flex-1 gap-1.5 opacity-60',
    'aria-disabled': true,
} as const

type CardProps = {
    control: Control<CategorizeFormValues>
    index: number
    model: BankCategorizeModel
    split: SplitLinesModel
}

type AmountController = ReturnType<typeof useController<CategorizeFormValues>>

// The line's Amount: the money text field, typed without a sign for the transaction's own
// direction.
function LineAmount({
    amount,
    message,
    index,
    model,
}: {
    amount: AmountController
    message: string | undefined
    index: number
    model: BankCategorizeModel
}) {
    const { field } = amount
    const value = typeof field.value === 'string' ? field.value : ''
    return (
        <View className="gap-1.5" style={AMOUNT_BOX_STYLE}>
            <Text className="text-sm font-semibold text-foreground">Amount</Text>
            <MoneyTextField
                inputRef={field.ref}
                testID={`bank-cat-amount-${index}`}
                accessibilityLabel={`Amount, line ${index + 1}`}
                value={value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={message}
                width={AMOUNT_WIDTH}
                currency={model.currency}
                editable={!model.isSending}
                selectsOnFocus
            />
        </View>
    )
}

function LineError({ text, testID }: { text: string | undefined; testID: string }) {
    if (!text) return null
    return (
        <Text testID={testID} className="text-xs text-danger">
            {text}
        </Text>
    )
}

// Out of the Tab order (⌘⌫ and a press reach it), a 44 pt target named for its line.
function RemoveLineButton({
    index,
    isDisabled,
    onRemove,
}: {
    index: number
    isDisabled: boolean
    onRemove: (index: number) => void
}) {
    const color = useThemeColor('muted-foreground')
    const onPress = () => onRemove(index)
    const className = isDisabled
        ? 'items-center justify-center opacity-60'
        : 'items-center justify-center'
    return (
        <Pressable
            testID={`bank-cat-remove-${index}`}
            accessibilityRole="button"
            accessibilityLabel={`Remove line ${index + 1}`}
            disabled={isDisabled}
            onPress={onPress}
            tabIndex={-1}
            className={className}
            style={TOUCH_STYLE}
        >
            <X size={18} color={color} />
        </Pressable>
    )
}

// One line of a split: its Account, then one row with Amount, Memo and the remove button;
// the Amount's message under the row, so the inputs line up; it shows once the field was
// left or the form was sent (a server refusal that names the amount). The card registers
// its node with the form, for ⌘⌫ (the line that holds the focus).
export function CategorizeLineCard({ control, index, model, split }: CardProps) {
    const account = useController({ control, name: `lines.${index}.account` })
    const amount = useController({ control, name: `lines.${index}.amount` })
    const { attachCard, focusAmount, removeLine } = split
    const isDisabled = model.isSending
    const attach = useCallback(
        (instance: unknown) => attachCard(index, instance),
        [attachCard, index]
    )
    const onPicked = () => focusAmount(index)
    const showsAmountError = amount.fieldState.isTouched || amount.formState.isSubmitted
    const amountError = showsAmountError ? amount.fieldState.error?.message : undefined
    const memoWrapper = isDisabled ? LINE_MEMO_WRAPPER_DISABLED : LINE_MEMO_WRAPPER
    return (
        <View
            ref={attach}
            testID={`bank-cat-line-${index}`}
            className="gap-3 rounded-md border border-border p-3"
        >
            <CategorizeAccountPicker
                label="Account"
                testID={`bank-cat-account-${index}`}
                value={account.field.value}
                onChange={account.field.onChange}
                errorText={account.fieldState.error?.message}
                options={model.categorizeOptions}
                state={model.categorizePicker}
                onRetry={model.retryLoad}
                isDisabled={isDisabled}
                takesFocus={false}
                onPicked={onPicked}
                fieldRef={account.field.ref}
            />
            <View className="gap-1">
                <View className="flex-row items-end gap-2">
                    <LineAmount amount={amount} message={amountError} index={index} model={model} />
                    <TextInput
                        control={control}
                        name={`lines.${index}.memo`}
                        label="Memo"
                        testID={`bank-cat-line-memo-${index}`}
                        accessibilityLabel={`Memo, line ${index + 1}`}
                        editable={!isDisabled}
                        maxLength={LINE_MEMO_MAX}
                        hideError
                        wrapperProps={memoWrapper}
                    />
                    <RemoveLineButton index={index} isDisabled={isDisabled} onRemove={removeLine} />
                </View>
                <LineError text={amountError} testID={`bank-cat-amount-${index}-error`} />
            </View>
        </View>
    )
}
