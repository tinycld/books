import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { TextInput, useController } from '@tinycld/core/ui/form'
import { useRef } from 'react'
import { type TextInputInstance, View } from 'react-native'
import { type BankCategorizeModel, useCategorizeForm } from '../../../hooks/useBankCategorize'
import { MEMO_MAX } from '../../../lib/transfer'
import { CategorizeAccountPicker } from './CategorizeAccountPicker'
import { PayeePicker } from './PayeePicker'
import { memoWrapperProps, RefusalLine, WaySubmit } from './WayParts'

type SectionProps = { model: BankCategorizeModel; scopeOwner: ScopeOwner }

// The Categorize way of a For review transaction: Payee, Account and Memo (it starts as
// the bank description), the refusal line, then Categorize (⌘↵ from any field). The
// drawer keys it by the transaction, so another transaction starts with a fresh form.
// While its write is sent the fields are disabled and the button shows "Categorizing…".
// The wrapper registers its node with the model, for Esc (leaveWayField).
export function CategorizeSection({ model, scopeOwner }: SectionProps) {
    const form = useCategorizeForm(model)
    const memoRef = useRef<TextInputInstance | null>(null)
    const payee = useController({ control: form.control, name: 'payee' })
    const account = useController({ control: form.control, name: 'lines.0.account' })
    const isDisabled = model.isSending
    const memoWrapper = memoWrapperProps(isDisabled)
    const onPicked = () => memoRef.current?.focus()
    return (
        <View ref={model.attachWayForm} testID="bank-cat-section" className="gap-3">
            <PayeePicker
                read={form.payee}
                value={payee.field.value}
                onChange={payee.field.onChange}
                isDisabled={isDisabled}
            />
            <CategorizeAccountPicker
                label="Account"
                testID="bank-cat-account-0"
                value={account.field.value}
                onChange={account.field.onChange}
                errorText={account.fieldState.error?.message}
                options={model.categorizeOptions}
                state={model.categorizePicker}
                onRetry={model.retryLoad}
                isDisabled={isDisabled}
                takesFocus
                onPicked={onPicked}
            />
            <TextInput
                control={form.control}
                name="memo"
                label="Memo"
                testID="bank-cat-memo"
                editable={!isDisabled}
                maxLength={MEMO_MAX}
                inputRef={memoRef}
                wrapperProps={memoWrapper}
            />
            <RefusalLine text={form.refusal} />
            <WaySubmit
                testID="bank-cat-submit"
                label="Categorize"
                busyLabel="Categorizing…"
                isSending={model.isSending}
                state={form.submitState}
                scopeOwner={scopeOwner}
                onPress={form.onSubmit}
            />
        </View>
    )
}
