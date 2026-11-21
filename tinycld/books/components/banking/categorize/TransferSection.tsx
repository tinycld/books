import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { TextInput, useController } from '@tinycld/core/ui/form'
import { useRef } from 'react'
import { Text, type TextInputInstance, View } from 'react-native'
import { type BankCategorizeModel, useBankTransferForm } from '../../../hooks/useBankCategorize'
import { MEMO_MAX } from '../../../lib/transfer'
import { CategorizeAccountPicker } from './CategorizeAccountPicker'
import { memoWrapperProps, RefusalLine, WaySubmit } from './WayParts'

type SectionProps = { model: BankCategorizeModel; scopeOwner: ScopeOwner }

// The Transfer way of a For review transaction: the line that says what will be
// recorded, the other account (To account for money spent, From account for money
// received) and Memo (it starts as the bank description), the refusal line, then Record
// transfer (⌘↵ from any field). Keyed by the transaction, as the Categorize way is, and
// its wrapper registers its node with the model, for Esc (leaveWayField).
export function TransferSection({ model, scopeOwner }: SectionProps) {
    const form = useBankTransferForm(model)
    const memoRef = useRef<TextInputInstance | null>(null)
    const account = useController({ control: form.control, name: 'account' })
    const isDisabled = model.isSending
    const memoWrapper = memoWrapperProps(isDisabled)
    const label = model.isSpent ? 'To account' : 'From account'
    const onPicked = () => memoRef.current?.focus()
    return (
        <View ref={model.attachWayForm} testID="bank-transfer-section" className="gap-3">
            <Text testID="bank-transfer-summary" className="text-sm text-muted-foreground">
                {model.transferSummary}
            </Text>
            <CategorizeAccountPicker
                label={label}
                testID="bank-transfer-account"
                value={account.field.value}
                onChange={account.field.onChange}
                errorText={account.fieldState.error?.message}
                options={model.transferOptions}
                state={model.transferPicker}
                onRetry={model.retryLoad}
                isDisabled={isDisabled}
                takesFocus
                onPicked={onPicked}
            />
            <TextInput
                control={form.control}
                name="memo"
                label="Memo"
                testID="bank-transfer-memo"
                editable={!isDisabled}
                maxLength={MEMO_MAX}
                inputRef={memoRef}
                wrapperProps={memoWrapper}
            />
            <RefusalLine text={form.refusal} />
            <WaySubmit
                testID="bank-transfer-submit"
                label="Record transfer"
                busyLabel="Recording…"
                isSending={model.isSending}
                state={form.submitState}
                scopeOwner={scopeOwner}
                onPress={form.onSubmit}
            />
        </View>
    )
}
