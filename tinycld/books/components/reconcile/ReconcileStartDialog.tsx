import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { Button, ButtonSpinner, ButtonText } from '@tinycld/core/ui/button'
import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { FormErrorSummary } from '@tinycld/core/ui/form'
import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import type { RefObject } from 'react'
import { type Control, useController } from 'react-hook-form'
import { Platform, Text, type TextInputInstance, View } from 'react-native'
import { useFocusOnOpen } from '../../hooks/useFocusOnOpen'
import type { ReconcileAccountRowData } from '../../hooks/useReconcileAccounts'
import {
    closeStartDialog,
    type StartPrefill,
    startPrefill,
    useReconcileStart,
} from '../../hooks/useReconcileStart'
import { useStatementBalance } from '../../hooks/useStatementBalance'
import { accountLabel } from '../../lib/account-options'
import {
    RECONCILE_TEXTS,
    type ReconcileStartMode,
    type ReconcileStartValues,
    startDialogTexts,
} from '../../lib/reconcile'
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

// The fields, the refusals and the buttons. A prefill that arrives after the form drew
// fills the fields the user has not changed (useReconcileStart).
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
                    onPress={closeStartDialog}
                    isDisabled={model.isStarting}
                    testID="reconcile-start-cancel"
                />
                <StartSubmit isStarting={model.isStarting} onPress={submit} texts={texts} />
            </Dialog.Footer>
        </>
    )
}

// The core Dialog (a sheet on a phone). The ending balance takes the focus when the dialog
// opens (web only: a native keyboard would cover the sheet). Escape, the backdrop and the
// sheet's close button go through closeStartDialog, which refuses while the insert runs.
function StartFrame({
    account,
    prefill,
    mode,
}: {
    account: ReconcileAccountRowData
    prefill: StartPrefill | null
    mode: ReconcileStartMode
}) {
    const focus = useFocusOnOpen(IS_WEB)
    const texts = startDialogTexts(mode, accountLabel(account))
    return (
        <Dialog
            isOpen
            onClose={closeStartDialog}
            title={texts.title}
            size="lg"
            testID="reconcile-start-dialog"
            hasCloseButton={false}
            initialFocusRef={focus.ref}
        >
            <StartFormPart
                account={account}
                prefill={prefill}
                balanceRef={focus.ref}
                texts={texts}
            />
        </Dialog>
    )
}

// An account with a bank connection: its latest statement file (OFX) dated after the last
// reconciled statement gives the balance and the date once the read answers. Until then,
// and when the read fails, the form has no prefill and no error text: the statement is
// extra, and useStatementBalance logs the failure.
function ConnectedStart({
    account,
    connectionId,
    mode,
}: {
    account: ReconcileAccountRowData
    connectionId: string
    mode: ReconcileStartMode
}) {
    const { statement, isReady, isError } = useStatementBalance(connectionId, account.type)
    const lastDate = account.lastFinished?.statement_date ?? ''
    const isRead = isReady && !isError
    const prefill = startPrefill(isRead ? statement : null, lastDate)
    return <StartFrame account={account} prefill={prefill} mode={mode} />
}

/**
 * The start dialog of `books/reconcile` (reconcile spec §3 "The start dialog"): drawn for
 * the account the store names (`account`, a listed account and a writer; the caller gives
 * none to a reader). `mode` sets the title and the submit label ('start': "Reconcile
 * <account>", Start reconciling; 'edit': "Edit statement information", Save); the submit
 * inserts a reconciliation in both, until the work screen's Edit info gives 'edit' its
 * data and its update. An account with a bank connection reads its latest statement file
 * (ConnectedStart, so the statement hook runs only with a connection id) while the form
 * already shows.
 */
export function ReconcileStartDialog({
    account,
    mode,
}: {
    account: ReconcileAccountRowData | undefined
    mode: ReconcileStartMode
}) {
    if (!account) return null
    const connectionId = account.connection?.id ?? ''
    if (connectionId !== '') {
        return <ConnectedStart account={account} connectionId={connectionId} mode={mode} />
    }
    return <StartFrame account={account} prefill={null} mode={mode} />
}
