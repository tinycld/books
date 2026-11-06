import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { type FieldValues, useForm, zodResolver } from '@tinycld/core/ui/form'
import { newRecordId } from 'pbtsdb/core'
import { type RefObject, useRef } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import {
    type BankDetailsValues,
    bankDetailsSchema,
    type ConnectionFormValues,
    connectionSchema,
} from '../lib/bank-connections'
import { messageOnlyRefusal } from '../lib/refusal'
import type { BankConnectionRow } from './useBankConnections'

// Core's handler sets field errors only and toasts anything else, so a refusal with no
// field data would never reach the dialog's summary: it goes to the form root by hand.
function refusalHandler<T extends FieldValues>(
    form: UseFormReturn<T>,
    inFlight: RefObject<boolean>
) {
    const onFieldErrors = handleMutationErrorsWithForm({
        setError: form.setError,
        getValues: form.getValues,
    })
    return (error: unknown) => {
        inFlight.current = false
        const message = messageOnlyRefusal(error)
        if (message) form.setError('root', { type: 'server', message })
        else onFieldErrors(error)
    }
}

export function useConnectAccountForm({ onConnected }: { onConnected(id: string): void }) {
    const [connections] = useStore('books_bank_connections')
    const inFlight = useRef(false)
    const form = useForm<ConnectionFormValues>({
        resolver: zodResolver(connectionSchema),
        defaultValues: { account: '', institution: '', account_mask: '' },
        resetOptions: { keepIsSubmitted: true },
    })
    const mutation = useMutation({
        mutationFn: function* ({ id, values }: { id: string; values: ConnectionFormValues }) {
            yield connections.insert({
                id,
                account: values.account,
                institution: values.institution.trim(),
                account_mask: values.account_mask,
            })
        },
        onSuccess: (_result, { id }) => {
            inFlight.current = false
            onConnected(id)
        },
        onError: refusalHandler(form, inFlight),
    })
    const run = (values: ConnectionFormValues) => {
        if (inFlight.current) return
        inFlight.current = true
        mutation.mutate({ id: newRecordId(), values })
    }
    return {
        form,
        submit: () => void form.handleSubmit(run)(),
        isPending: mutation.isPending,
    }
}

export function useBankDetailsForm({
    connection,
    onClose,
}: {
    connection: BankConnectionRow
    onClose(): void
}) {
    const [connections] = useStore('books_bank_connections')
    const inFlight = useRef(false)
    const form = useForm<BankDetailsValues>({
        resolver: zodResolver(bankDetailsSchema),
        defaultValues: {
            institution: connection.institution,
            account_mask: connection.accountMask,
        },
        resetOptions: { keepIsSubmitted: true },
    })
    // The update rule pins `account`, so only the bank details are sent.
    const mutation = useMutation({
        mutationFn: function* (values: BankDetailsValues) {
            yield connections.update(connection.id, draft => {
                draft.institution = values.institution.trim()
                draft.account_mask = values.account_mask
            })
        },
        onSuccess: () => {
            inFlight.current = false
            onClose()
        },
        onError: refusalHandler(form, inFlight),
    })
    const run = (values: BankDetailsValues) => {
        if (inFlight.current) return
        inFlight.current = true
        mutation.mutate(values)
    }
    return {
        form,
        submit: () => void form.handleSubmit(run)(),
        isPending: mutation.isPending,
    }
}
