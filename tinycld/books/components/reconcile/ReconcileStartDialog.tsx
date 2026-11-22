import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { Button, ButtonSpinner, ButtonText } from '@tinycld/core/ui/button'
import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { FormErrorSummary } from '@tinycld/core/ui/form'
import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import type { ReactNode, RefObject } from 'react'
import { type Control, useController } from 'react-hook-form'
import { Platform, Text, type TextInputInstance, View } from 'react-native'
import { useFocusOnOpen } from '../../hooks/useFocusOnOpen'
import type { ReconcileAccountRowData } from '../../hooks/useReconcileAccounts'
import {
    closeEditDialog,
    closeStartDialog,
    type ReconcileEditTarget,
    type StartPrefill,
    type StatementDialogModel,
    startPrefill,
    useReconcileEdit,
    useReconcileStart,
} from '../../hooks/useReconcileStart'
import { useStatementBalance } from '../../hooks/useStatementBalance'
import { accountLabel } from '../../lib/account-options'
import { RECONCILE_TEXTS, type ReconcileStartValues, startDialogTexts } from '../../lib/reconcile'
import { rootErrorOnly } from '../../lib/root-errors'
import { MoneyTextField } from '../MoneyTextField'
import { FieldError } from '../payments/PaymentMoneyField'

const IS_WEB = Platform.OS === 'web'

type BalanceRef = RefObject<TextInputInstance | null>
type StartTexts = ReturnType<typeof startDialogTexts>

function FieldLabel({ text }: { text: string }) {
    return <Text className="text-sm font-semibold text-foreground">{text}</Text>
}

function FieldNote({ text, testID }: { text: string; testID?: string }) {
    if (!text) return null
    return (
        <Text testID={testID} className="text-xs text-muted-foreground">
            {text}
        </Text>
    )
}

// A money field of the form: Books MoneyTextField, its message under it.
function StartMoneyField({
    control,
    name,
    label,
    testID,
    currency,
    balanceRef,
}: {
    control: Control<ReconcileStartValues>
    name: 'balance' | 'statementOut' | 'statementIn'
    label: string
    testID: string
    currency: string
    balanceRef?: BalanceRef
}) {
    const { field, fieldState } = useController({ control, name })
    const message = fieldState.error?.message ?? ''
    const setRef = (node: TextInputInstance | null) => {
        if (balanceRef) balanceRef.current = node
    }
    return (
        <View className="min-w-0 flex-1 gap-1.5">
            <FieldLabel text={label} />
            <MoneyTextField
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={message}
                testID={testID}
                accessibilityLabel={label}
                currency={currency}
                inputRef={setRef}
                keepsZero
            />
            <FieldError message={message} testID={`${testID}-error`} />
        </View>
    )
}

// Ending date: core DateField, whose calendar popover is a fixed 300 wide (bounded to the
// field, lesson 2). A cleared field reaches the schema as ''.
function EndingDateField({ control }: { control: Control<ReconcileStartValues> }) {
    const { field, fieldState } = useController({ control, name: 'date' })
    const message = fieldState.error?.message ?? ''
    const change = (next: string | null) => field.onChange(next ?? '')
    return (
        <View className="min-w-0 flex-1 gap-1.5">
            <FieldLabel text="Ending date" />
            <DateField
                value={field.value || null}
                onChange={change}
                onBlur={field.onBlur}
                withTime={false}
                accessibilityLabel="Ending date"
                testID="reconcile-ending-date"
            />
            <FieldError message={message} testID="reconcile-ending-date-error" />
        </View>
    )
}

function StartSubmit({
    isStarting,
    onPress,
    texts,
}: {
    isStarting: boolean
    onPress: () => void
    texts: StartTexts
}) {
    if (isStarting) {
        return (
            <Button testID="reconcile-start-submit" size="sm" isDisabled>
                <ButtonSpinner />
                <ButtonText>{texts.sending}</ButtonText>
            </Button>
        )
    }
    return (
        <Dialog.ActionButton
            label={texts.submit}
            onPress={onPress}
            shortcut={DIALOG_SUBMIT_SHORTCUT}
            testID="reconcile-start-submit"
        />
    )
}

// The fields, the refusals and the buttons, of a start and of Edit info.
function StatementFormBody({
    model,
    balanceRef,
    texts,
}: {
    model: StatementDialogModel
    balanceRef: BalanceRef
    texts: StartTexts
}) {
    const { control, formState } = model.form
    const isWide = useBreakpoint() !== 'mobile'
    const pair = isWide ? 'flex-row items-start gap-3' : 'gap-4'
    const submit = () => void model.submit()
    return (
        <>
            <Dialog.Body>
                <View className="gap-4">
                    <View className="gap-0.5">
                        <FieldLabel text="Beginning balance" />
                        <Text
                            testID="reconcile-beginning"
                            className="text-base tabular-nums text-foreground"
                        >
                            {model.beginning}
                        </Text>
                        <FieldNote text={model.beginningNote} />
                    </View>
                    <View className="gap-1.5">
                        <View className={pair}>
                            <StartMoneyField
                                control={control}
                                name="balance"
                                label="Ending balance"
                                testID="reconcile-ending-balance"
                                currency={model.currency}
                                balanceRef={balanceRef}
                            />
                            <EndingDateField control={control} />
                        </View>
                        <FieldNote text={model.fileNote} testID="reconcile-file-note" />
                    </View>
                    <View className="gap-1.5">
                        <View className="gap-0.5">
                            <FieldLabel text="Statement totals (optional)" />
                            <FieldNote text={RECONCILE_TEXTS.totalsHint} />
                        </View>
                        <View className="flex-row items-start gap-3">
                            <StartMoneyField
                                control={control}
                                name="statementOut"
                                label={model.words.out}
                                testID="reconcile-statement-out"
                                currency={model.currency}
                            />
                            <StartMoneyField
                                control={control}
                                name="statementIn"
                                label={model.words.in}
                                testID="reconcile-statement-in"
                                currency={model.currency}
                            />
                        </View>
                    </View>
                    <FormErrorSummary
                        testID="reconcile-start-errors"
                        errors={rootErrorOnly(formState.errors)}
                        showFieldNames={false}
                        isEnabled={formState.isSubmitted}
                    />
                </View>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton
                    onPress={model.onClose}
                    isDisabled={model.isStarting}
                    testID="reconcile-start-cancel"
                />
                <StartSubmit isStarting={model.isStarting} onPress={submit} texts={texts} />
            </Dialog.Footer>
        </>
    )
}

// A start's form. A prefill that arrives after the form drew fills the fields the user has
// not changed (useReconcileStart).
function StartFormPart({
    account,
    prefill,
    balanceRef,
    texts,
}: {
    account: ReconcileAccountRowData
    prefill: StartPrefill | null
    balanceRef: BalanceRef
    texts: StartTexts
}) {
    const model = useReconcileStart(account, account.lastFinished, prefill)
    return <StatementFormBody model={model} balanceRef={balanceRef} texts={texts} />
}

// Edit info's form, with the stored values (useReconcileEdit).
function EditFormPart({
    target,
    balanceRef,
    texts,
}: {
    target: ReconcileEditTarget
    balanceRef: BalanceRef
    texts: StartTexts
}) {
    const model = useReconcileEdit(target)
    return <StatementFormBody model={model} balanceRef={balanceRef} texts={texts} />
}

// The core Dialog (a sheet on a phone). The ending balance takes the focus when the dialog
// opens (web only: a native keyboard would cover the sheet). Escape, the backdrop and the
// sheet's close button go through `onClose`, which refuses while the write runs.
function StatementFrame({
    texts,
    onClose,
    children,
}: {
    texts: StartTexts
    onClose: () => void
    children: (balanceRef: BalanceRef) => ReactNode
}) {
    const focus = useFocusOnOpen(IS_WEB)
    return (
        <Dialog
            isOpen
            onClose={onClose}
            title={texts.title}
            size="lg"
            testID="reconcile-start-dialog"
            hasCloseButton={false}
            initialFocusRef={focus.ref}
        >
            {children(focus.ref)}
        </Dialog>
    )
}

function StartFrame({
    account,
    prefill,
}: {
    account: ReconcileAccountRowData
    prefill: StartPrefill | null
}) {
    const texts = startDialogTexts('start', accountLabel(account))
    const form = (balanceRef: BalanceRef) => (
        <StartFormPart account={account} prefill={prefill} balanceRef={balanceRef} texts={texts} />
    )
    return (
        <StatementFrame texts={texts} onClose={closeStartDialog}>
            {form}
        </StatementFrame>
    )
}

// An account with a bank connection: its latest statement file (OFX) dated after the last
// reconciled statement gives the balance and the date once the read answers. Until then,
// and when the read fails, the form has no prefill and no error text: the statement is
// extra, and useStatementBalance logs the failure.
function ConnectedStart({
    account,
    connectionId,
}: {
    account: ReconcileAccountRowData
    connectionId: string
}) {
    const { statement, isReady, isError } = useStatementBalance(connectionId, account.type)
    const lastDate = account.lastFinished?.statement_date ?? ''
    const isRead = isReady && !isError
    const prefill = startPrefill(isRead ? statement : null, lastDate)
    return <StartFrame account={account} prefill={prefill} />
}

function EditFrame({ target }: { target: ReconcileEditTarget }) {
    const texts = startDialogTexts('edit', '')
    const form = (balanceRef: BalanceRef) => (
        <EditFormPart target={target} balanceRef={balanceRef} texts={texts} />
    )
    return (
        <StatementFrame texts={texts} onClose={closeEditDialog}>
            {form}
        </StatementFrame>
    )
}

type StartDialogProps =
    | { mode: 'start'; account: ReconcileAccountRowData | undefined }
    | { mode: 'edit'; target: ReconcileEditTarget | null }

/**
 * The statement dialog (reconcile spec §3 "The start dialog", "Edit info"). 'start', on
 * `books/reconcile`: drawn for the account the store names (`account`, a listed account and
 * a writer; the caller gives none to a reader), titled "Reconcile <account>", and Start
 * reconciling inserts a reconciliation; an account with a bank connection reads its latest
 * statement file (ConnectedStart, so the statement hook runs only with a connection id)
 * while the form already shows. 'edit', on the work screen: drawn while Edit info is open
 * (`target`, from the screen's record query; the dialog loads nothing of its own), titled
 * "Edit statement information", with the stored values, and Save updates the
 * reconciliation.
 */
export function ReconcileStartDialog(props: StartDialogProps) {
    if (props.mode === 'edit') {
        if (!props.target) return null
        return <EditFrame target={props.target} />
    }
    const { account } = props
    if (!account) return null
    const connectionId = account.connection?.id ?? ''
    if (connectionId !== '') {
        return <ConnectedStart account={account} connectionId={connectionId} />
    }
    return <StartFrame account={account} prefill={null} />
}
