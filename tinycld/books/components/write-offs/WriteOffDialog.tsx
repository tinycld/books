import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { FormErrorSummary, SelectInput, TextAreaInput } from '@tinycld/core/ui/form'
import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import { useFocusEffect } from 'expo-router'
import { type RefObject, useCallback } from 'react'
import { get, useController } from 'react-hook-form'
import { Platform, Text, type TextInputInstance, View } from 'react-native'
import { useFocusOnOpen } from '../../hooks/useFocusOnOpen'
import {
    useWriteOff,
    useWriteOffForm,
    type WriteOffDialogModel,
    type WriteOffFormModel,
    type WriteOffReady,
} from '../../hooks/useWriteOff'
import { rootErrorOnly } from '../../lib/root-errors'
import { WRITE_OFF_TEXTS } from '../../lib/write-off-fixture'
import { WRITE_OFF_MESSAGES } from '../../lib/write-off-schema'
import { useWriteOffStore } from '../../stores/write-off-store'
import { DocumentInlineNotice } from '../documents/DocumentInlineNotice'
import { FieldError } from '../payments/PaymentMoneyField'
import { DialogLoadError } from '../taxes/DialogLoadError'

const SKELETON_ROW = { height: 44 }
const FIGURE_SKELETON = { height: 32, width: 120 }
const DATE_WIDTH = { maxWidth: 240 }
const BIG_FIGURE = 'text-2xl font-semibold text-foreground tabular-nums'
const IS_WEB = Platform.OS === 'web'

function errorText(errors: unknown, path: string): string {
    const message: unknown = get(errors, path)?.message
    return typeof message === 'string' ? message : ''
}

interface FieldProps {
    model: WriteOffDialogModel
    formModel: WriteOffFormModel
}

// Write-off date: core DateField (its "Open calendar" button follows it), its error under
// it.
function WriteOffDateField({
    model,
    formModel,
    inputRef,
}: FieldProps & { inputRef: RefObject<TextInputInstance | null> }) {
    const { control, formState } = formModel.form
    const { field } = useController({ control, name: 'date' })
    const handleChange = (next: string | null) => field.onChange(next ?? '')
    const error = errorText(formState.errors, 'date')
    return (
        <View className="gap-1" style={DATE_WIDTH}>
            <Text className="text-sm font-semibold text-foreground">Write-off date *</Text>
            <DateField
                value={field.value}
                onChange={handleChange}
                withTime={false}
                disabled={model.state.fieldsDisabled}
                accessibilityLabel="Write-off date"
                testID="write-off-date"
                inputRef={inputRef}
            />
            <FieldError message={error} testID="write-off-date-error" />
        </View>
    )
}

// The select's own wrapper without its bottom margin, so the no-account text sits directly
// under the select; the field's View below gives that margin back after the text.
const SELECT_WRAPPER = { className: 'gap-1.5' }

// Write off to: the active expense and other expense accounts in chart order, or, for a
// chart with none, the inline error under the disabled select. SelectInput draws its own
// error: the red border and the message directly under the select.
function WriteOffAccountField({ model, formModel }: FieldProps) {
    const { control } = formModel.form
    const hasNone = model.state.body === 'no-account'
    const noAccount = hasNone ? WRITE_OFF_MESSAGES.noExpenseAccount : ''
    return (
        <View className="gap-1 mb-3">
            <SelectInput
                name="account"
                control={control}
                label="Write off to *"
                options={model.options}
                placeholder="Choose an account"
                disabled={model.state.fieldsDisabled || hasNone}
                wrapperProps={SELECT_WRAPPER}
                testID="write-off-account"
            />
            <FieldError message={noAccount} testID="write-off-no-account" />
        </View>
    )
}

// Reason (internal): TextAreaInput draws its own error, the red border and the message
// directly under the field.
function WriteOffReasonField({ model, formModel }: FieldProps) {
    const { control } = formModel.form
    return (
        <TextAreaInput
            name="memo"
            control={control}
            label="Reason (internal)"
            placeholder={WRITE_OFF_TEXTS.reasonPlaceholder}
            numberOfLines={3}
            editable={!model.state.fieldsDisabled}
            testID="write-off-reason"
        />
    )
}

function WriteOffLoading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="write-off-loading" className="gap-2">
            <View className="rounded-md bg-surface-secondary" style={SKELETON_ROW} />
            <View className="rounded-md bg-surface-secondary" style={SKELETON_ROW} />
            <View className="rounded-md bg-surface-secondary" style={SKELETON_ROW} />
        </View>
    )
}

// The figure's value: the invoice's open balance, or a skeleton in its place until the
// invoice has landed.
function WriteOffFigureValue({ amount }: { amount: string }) {
    if (amount === '') {
        return <View className="rounded-md bg-surface-secondary" style={FIGURE_SKELETON} />
    }
    return (
        <Text testID="write-off-amount" className={BIG_FIGURE}>
            {amount}
        </Text>
    )
}

// The summary line and the figure, the same in every state of the dialog.
function WriteOffHead({ model }: { model: WriteOffDialogModel }) {
    return (
        <>
            <Text testID="write-off-summary" className="text-sm text-muted-foreground">
                {model.summary}
            </Text>
            <View className="gap-0.5">
                <Text className="text-xs text-muted-foreground">{WRITE_OFF_TEXTS.amountLabel}</Text>
                <WriteOffFigureValue amount={model.amount} />
            </View>
        </>
    )
}

function NoBalanceNotice({ isVisible, message }: { isVisible: boolean; message: string }) {
    if (!isVisible) return null
    return <DocumentInlineNotice testID="write-off-no-balance" message={message} />
}

// Before every read has landed: the skeleton rows or the load error with Retry, and the
// action button disabled.
function WriteOffWaiting({ model, isVisible }: { model: WriteOffDialogModel; isVisible: boolean }) {
    if (!isVisible) return null
    const isLoading = model.state.body === 'loading'
    const isLoadError = model.state.body === 'load-error'
    const noop = () => undefined
    return (
        <>
            <Dialog.Body>
                <View className="gap-3">
                    <WriteOffHead model={model} />
                    <WriteOffLoading isVisible={isLoading} />
                    <DialogLoadError
                        isVisible={isLoadError}
                        testIdPrefix="write-off-load"
                        testID="write-off-load-error"
                        message={WRITE_OFF_MESSAGES.loadError}
                        onRetry={model.retry}
                    />
                </View>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton
                    onPress={model.close}
                    isDisabled={model.isHeld}
                    testID="write-off-cancel"
                />
                <Dialog.ActionButton
                    label={model.actionLabel}
                    onPress={noop}
                    isDisabled
                    shortcut={DIALOG_SUBMIT_SHORTCUT}
                    testID="write-off-submit"
                />
            </Dialog.Footer>
        </>
    )
}

// The fields, the notices, the root refusals and the action button: mounted once every
// read has landed, so its form starts from the defaults the reads give.
function WriteOffReadyPart({
    model,
    ready,
    dateRef,
}: {
    model: WriteOffDialogModel
    ready: WriteOffReady
    dateRef: RefObject<TextInputInstance | null>
}) {
    const formModel = useWriteOffForm(ready)
    const { formState } = formModel.form
    const submit = () => void formModel.submit()
    const isSubmitDisabled = !model.state.canSubmit
    return (
        <>
            <Dialog.Body>
                <View className="gap-3">
                    <WriteOffHead model={model} />
                    <NoBalanceNotice
                        isVisible={model.state.noBalance}
                        message={model.noBalanceText}
                    />
                    <WriteOffDateField model={model} formModel={formModel} inputRef={dateRef} />
                    <WriteOffAccountField model={model} formModel={formModel} />
                    <WriteOffReasonField model={model} formModel={formModel} />
                    <DocumentInlineNotice testID="write-off-notice" message={model.notice} />
                    <FormErrorSummary
                        testID="write-off-error-summary"
                        errors={rootErrorOnly(formState.errors)}
                        showFieldNames={false}
                        isEnabled={formState.isSubmitted}
                    />
                </View>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton
                    onPress={model.close}
                    isDisabled={model.isHeld}
                    testID="write-off-cancel"
                />
                <Dialog.ActionButton
                    label={model.actionLabel}
                    onPress={submit}
                    isDisabled={isSubmitDisabled}
                    shortcut={DIALOG_SUBMIT_SHORTCUT}
                    testID="write-off-submit"
                />
            </Dialog.Footer>
        </>
    )
}

function WriteOffReadySlot({
    model,
    dateRef,
}: {
    model: WriteOffDialogModel
    dateRef: RefObject<TextInputInstance | null>
}) {
    if (!model.ready) return null
    return <WriteOffReadyPart model={model} ready={model.ready} dateRef={dateRef} />
}

// The dialog of one open: mounted while the store names an invoice for this owner, so the
// form starts fresh each time.
function OpenWriteOffDialog({ owner }: { owner: string }) {
    const model = useWriteOff(owner)
    const isReady = model.ready !== null
    // The Write-off date takes the focus when the fields first draw (web only: a native
    // keyboard would cover the Sheet).
    const focus = useFocusOnOpen(IS_WEB && isReady)
    return (
        <Dialog
            isOpen
            onClose={model.close}
            title={model.title}
            size="md"
            testID="write-off-dialog"
            hasCloseButton={false}
            initialFocusRef={focus.ref}
        >
            <WriteOffWaiting model={model} isVisible={!isReady} />
            <WriteOffReadySlot model={model} dateRef={focus.ref} />
        </Dialog>
    )
}

// The store outlives the screen: close this owner's dialog when its screen loses focus or
// unmounts (not while its write runs; the write closes it when it ends).
function useCloseOnBlur(owner: string) {
    useFocusEffect(
        useCallback(
            () => () => {
                const store = useWriteOffStore.getState()
                if (store.openFor?.owner !== owner || store.isHeld) return
                store.close()
            },
            [owner]
        )
    )
}

/**
 * The Write off dialog (write-off spec §3.2, §3.3): a core Dialog of size md (a Sheet on a
 * phone) with the summary line, the amount to write off (the invoice's live open balance),
 * the no-balance notice when that balance went to 0, Write-off date, Write off to, Reason
 * (internal), the notice and the root refusals; three skeleton rows while the reads load
 * and the load error with Retry when one fails; Cancel (Esc) and "Write off <amount>" (⌘↵).
 * Each screen that can open it mounts one with its own `owner`; it draws only while
 * useWriteOffStore names an invoice for that owner, and closes when the screen loses focus.
 */
export function WriteOffDialog({ owner }: { owner: string }) {
    const openFor = useWriteOffStore(state => state.openFor)
    useCloseOnBlur(owner)
    if (openFor?.owner !== owner) return null
    return <OpenWriteOffDialog owner={owner} />
}
