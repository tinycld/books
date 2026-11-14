import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useForm, zodResolver } from '@tinycld/core/ui/form'
import { type CustomerNotesValues, customerNotesSchema } from '../lib/customer-notes-schema'
import { recordRefusalHandler } from '../lib/record-refusals'
import type { BooksCustomers } from '../types'

export type NotesSaveResult = 'saved' | 'refused'

// react-hook-form lays `resetOptions` under every `reset` call, so a reset that ends the
// edits must turn the follow-the-record options off, or it keeps the typed text and its
// errors.
const DROP_EDITS = { keepDirtyValues: false, keepErrors: false } as const

function storedNotes(record: BooksCustomers): CustomerNotesValues {
    return { notes: record.notes ?? '' }
}

/**
 * The customer page's Notes field: the one place a customer's notes are edited. The
 * form follows the stored notes while it is clean, and keeps what the user typed when
 * the record changes underneath. `save` writes the notes and marks the field clean; a
 * refusal lands on the field, or on the form root when it names no field, and `save`
 * answers 'refused'. A reader's form never saves and is never dirty.
 */
export function useCustomerNotesForm(record: BooksCustomers, readOnly: boolean) {
    const [customersCollection] = useStore('books_customers')
    const values = storedNotes(record)
    const form = useForm<CustomerNotesValues>({
        resolver: zodResolver(customerNotesSchema),
        defaultValues: values,
        values,
        resetOptions: { keepDirtyValues: true, keepErrors: true, keepIsSubmitted: true },
    })
    // Read through the form state proxy, so a change re-renders the page. Not `isDirty`:
    // the `values` reset keeps the typed text (keepDirtyValues) but turns `isDirty` false
    // after an optimistic write and its rollback, while the field stays dirty.
    const isDirty = !readOnly && form.formState.dirtyFields.notes === true

    const update = useMutation({
        mutationFn: function* (saved: CustomerNotesValues) {
            yield customersCollection.update(record.id, draft => {
                draft.notes = saved.notes
            })
        },
        onError: recordRefusalHandler(
            form,
            handleMutationErrorsWithForm({
                setError: form.setError,
                getValues: form.getValues,
                operation: 'books.customers.notes',
                collection: 'books_customers',
            })
        ),
    })

    const save = async (): Promise<NotesSaveResult> => {
        // The live field state, not the last render's: a save may start after the page
        // closed, when no render follows.
        if (readOnly || !form.getFieldState('notes').isDirty) return 'saved'
        // A new answer from the server replaces the last one.
        form.clearErrors('root')
        let result: NotesSaveResult = 'refused'
        await form.handleSubmit(async saved => {
            try {
                await update.mutateAsync(saved)
                form.reset(saved, { ...DROP_EDITS, keepIsSubmitted: true })
                result = 'saved'
            } catch {
                // The mutation's onError has put the refusal on the form.
                result = 'refused'
            }
        })()
        return result
    }

    const reset = () => form.reset(storedNotes(record), { ...DROP_EDITS, keepIsSubmitted: false })

    return { form, isDirty, isSaving: update.isPending, save, reset }
}
