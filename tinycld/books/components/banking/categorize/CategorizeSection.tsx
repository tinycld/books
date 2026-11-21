import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { TextInput, useController } from '@tinycld/core/ui/form'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { type RefObject, useRef } from 'react'
import { Pressable, Text, type TextInputInstance, View } from 'react-native'
import {
    type BankCategorizeModel,
    type CategorizeFormModel,
    useCategorizeForm,
    useSplitShortcuts,
} from '../../../hooks/useBankCategorize'
import { MEMO_MAX } from '../../../lib/transfer'
import { CategorizeAccountPicker } from './CategorizeAccountPicker'
import { CategorizeLineCard } from './CategorizeLineCard'
import { PayeePicker } from './PayeePicker'
import { SplitTotals } from './SplitTotals'
import { memoWrapperProps, RefusalLine, WaySubmit } from './WayParts'

type SectionProps = { model: BankCategorizeModel; scopeOwner: ScopeOwner }

// ⌥↵ adds a line from any field of a split (the first press, Split, is useSplitShortcuts').
const ADD_LINE_KEY = { keys: 'Alt+Enter', scope: 'list', allowInInputs: true } as const
const LINK_STYLE = { minHeight: 44 }

type BodyProps = {
    model: BankCategorizeModel
    form: CategorizeFormModel
    memoRef: RefObject<TextInputInstance | null>
}

function MemoField({ form, model, memoRef }: BodyProps) {
    const isDisabled = model.isSending
    return (
        <TextInput
            control={form.control}
            name="memo"
            label="Memo"
            testID="bank-cat-memo"
            editable={!isDisabled}
            maxLength={MEMO_MAX}
            inputRef={memoRef}
            wrapperProps={memoWrapperProps(isDisabled)}
        />
    )
}

// The link that turns the Account field into split lines (⌥↵ does the same).
function SplitLink({ isDisabled, onPress }: { isDisabled: boolean; onPress: () => void }) {
    const className = isDisabled
        ? 'justify-center self-start opacity-60'
        : 'justify-center self-start'
    return (
        <Pressable
            testID="bank-cat-split"
            accessibilityRole="button"
            disabled={isDisabled}
            onPress={onPress}
            className={className}
            style={LINK_STYLE}
        >
            <Text className="text-sm font-medium text-primary">Split</Text>
        </Pressable>
    )
}

// One account: Account (the pick moves the focus to Memo), Memo, the Split link.
function OneAccountBody({ model, form, memoRef }: BodyProps) {
    const account = useController({ control: form.control, name: 'lines.0.account' })
    const isDisabled = model.isSending
    const onPicked = () => memoRef.current?.focus()
    return (
        <>
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
                fieldRef={account.field.ref}
            />
            <MemoField model={model} form={form} memoRef={memoRef} />
            <SplitLink isDisabled={isDisabled} onPress={form.split.addLine} />
            <RefusalLine text={form.refusal} />
        </>
    )
}

// A split: Memo of the entry, a card for each line, the totals, the refusal line under
// them, then Add a line (⌥↵, disabled at 50 lines with its hint).
function SplitBody({ model, form, memoRef, scopeOwner }: BodyProps & { scopeOwner: ScopeOwner }) {
    const { split } = form
    const cards = split.fields.map((field, index) => (
        <CategorizeLineCard
            key={field.id}
            control={form.control}
            index={index}
            model={model}
            split={split}
        />
    ))
    return (
        <>
            <MemoField model={model} form={form} memoRef={memoRef} />
            <View className="gap-2">{cards}</View>
            <SplitTotals
                totals={split.totals}
                bankAmount={model.bankAmount}
                currency={model.currency}
            />
            <RefusalLine text={form.refusal} />
            <View className="flex-row">
                <ShortcutButton
                    testID="bank-cat-add-line"
                    label="Add a line"
                    variant="outline"
                    shortcut={ADD_LINE_KEY}
                    scopeOwner={scopeOwner}
                    isDisabled={split.addState.isDisabled}
                    accessibilityHint={split.addState.hint}
                    className="min-h-11"
                    onPress={split.addLine}
                />
            </View>
        </>
    )
}

// The Categorize way of a For review transaction: Payee, then Account and Memo (it starts
// as the bank description) with the Split link, or a split's lines; each body draws the
// refusal line (a split's under its totals); then Categorize (⌘↵ from any field). The drawer keys it by the transaction, so another
// transaction starts with a fresh form. While its write is sent the fields are disabled
// and the button shows "Categorizing…". The wrapper registers its node with the model, for
// Esc (leaveWayField).
export function CategorizeSection({ model, scopeOwner }: SectionProps) {
    const form = useCategorizeForm(model)
    const memoRef = useRef<TextInputInstance | null>(null)
    const payee = useController({ control: form.control, name: 'payee' })
    const isDisabled = model.isSending
    useSplitShortcuts(form.split, isDisabled, scopeOwner)
    const body = form.split.isSplit ? (
        <SplitBody model={model} form={form} memoRef={memoRef} scopeOwner={scopeOwner} />
    ) : (
        <OneAccountBody model={model} form={form} memoRef={memoRef} />
    )
    return (
        <View ref={model.attachWayForm} testID="bank-cat-section" className="gap-3">
            <PayeePicker
                read={form.payee}
                value={payee.field.value}
                onChange={payee.field.onChange}
                isDisabled={isDisabled}
            />
            {body}
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
