import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { useController, useForm, zodResolver } from '@tinycld/core/ui/form'
import { useCallback, useRef, useState } from 'react'
import {
    type BatchCategorizeValues,
    batchCategorizeSchema,
    categorizeAccountOptions,
    pickerStateOf,
} from '../lib/bank-categorize'
import { parsePartyOptionId } from '../lib/line-party-options'
import { useBankingUIStore } from '../stores/banking-ui-store'
import { useCategorizeAccounts, usePayeeRead } from './useBankCategorize'
import type { ReviewBatch } from './useReviewBatch'
import type { CategorizeChoice, ReviewTabModel } from './useReviewTab'

type Focusable = { focus: () => void }

function isFocusable(value: unknown): value is Focusable {
    return (
        typeof value === 'object' &&
        value !== null &&
        'focus' in value &&
        typeof value.focus === 'function'
    )
}

function titleOf(count: number): string {
    return `Categorize ${count} ${count === 1 ? 'transaction' : 'transactions'}`
}

type CategorizeChosenInput = {
    // The chosen rows as the For review tab shows them now; the dialog keeps the choice it
    // opened with.
    choice: CategorizeChoice
    onCategorizeChosen: ReviewTabModel['onCategorizeChosen']
    // The connection's ledger account, which the Account picker does not offer.
    connectionAccountId: string
    batch: ReviewBatch
}

// The Categorize dialog of the rows chosen on For review: one account (required) and an
// optional payee for every chosen row (batchCategorizeSchema), sent through the page's one
// batch as one insert per row with the row's own bank description as its memo
// (onCategorizeChosen). The dialog keeps the choice it opened with (the rows stay in the
// list until the server's update arrives, and the bar shows that choice while the run is in
// flight). The dialog closes when the run ends; the result line and the refused rows that
// stay chosen are the batch's (useReviewTab). The Account trigger is the dialog's focus on
// open (core Dialog `initialFocusRef`): the header's Close button is its first focusable.
export function useCategorizeChosen(input: CategorizeChosenInput) {
    const { batch } = input
    const closeDialog = useBankingUIStore(s => s.closeDialog)
    const isAdding = useBankingUIStore(s => s.isAdding)
    const writes = useServerActionState()
    const [sent] = useState(input.choice)
    const accounts = useCategorizeAccounts(true)
    const options = categorizeAccountOptions(accounts.accounts, input.connectionAccountId)
    const picker = pickerStateOf({
        isLoading: !accounts.isReady,
        isError: accounts.isError,
        options,
    })
    const payee = usePayeeRead()
    const form = useForm<BatchCategorizeValues>({
        resolver: zodResolver(batchCategorizeSchema),
        defaultValues: { account: '', payee: '' },
    })
    const account = useController({ control: form.control, name: 'account' })
    const payeeField = useController({ control: form.control, name: 'payee' })
    const focusRef = useRef<Focusable | null>(null)
    const attachAccount = useCallback((instance: unknown) => {
        focusRef.current = isFocusable(instance) ? instance : null
    }, [])

    const isRunning = batch.pending?.origin === 'bar' && batch.pending.kind === 'categorize'
    // A failed read of the accounts or the payees keeps Categorize disabled, as in the
    // drawer's form; so does any run of the page's batch and a drawer Categorize in flight.
    // While the server takes no writes, Dialog.ActionButton disables itself with its hint.
    const isSubmitDisabled =
        batch.isPending ||
        isAdding ||
        writes.isDisabled ||
        picker.loadFailed ||
        payee.parties.loadFailed

    const send = (values: BatchCategorizeValues) => {
        const party = parsePartyOptionId(values.payee)
        const target = {
            account: values.account,
            customer: party?.kind === 'customer' ? party.id : '',
            vendor: party?.kind === 'vendor' ? party.id : '',
        }
        void input.onCategorizeChosen(sent, target).then(closeDialog)
    }
    const onSubmit = () => {
        if (isSubmitDisabled || sent.ids.length === 0) return
        void form.handleSubmit(send)()
    }
    // The dialog stays up through its run: Cancel, Esc and the backdrop wait for it.
    const onClose = () => {
        if (isRunning) return
        closeDialog()
    }

    return {
        hasRows: sent.ids.length > 0,
        title: titleOf(sent.ids.length),
        sums: sent.sums,
        account: {
            value: account.field.value,
            onChange: account.field.onChange,
            errorText: form.formState.errors.account?.message,
            options,
            state: picker,
            onRetry: accounts.retryLoad,
            fieldRef: attachAccount,
        },
        payee: {
            read: payee,
            value: payeeField.field.value,
            onChange: payeeField.field.onChange,
        },
        focusRef,
        isRunning,
        isSubmitDisabled,
        onSubmit,
        onClose,
    }
}

export type CategorizeChosenModel = ReturnType<typeof useCategorizeChosen>
