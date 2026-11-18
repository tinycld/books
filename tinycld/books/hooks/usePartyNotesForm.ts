import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useForm, zodResolver } from '@tinycld/core/ui/form'
import { type PartyNotesValues, partyNotesSchema } from '../lib/party-notes-schema'
import type { PartyRef } from '../lib/party-page-tabs'
import { recordRefusalHandler } from '../lib/record-refusals'

export type NotesSaveResult = 'saved' | 'refused'

// react-hook-form lays `resetOptions` under every `reset` call, so a reset that ends the
// edits must turn the follow-the-record options off, or it keeps the typed text and its
// errors.
const DROP_EDITS = { keepDirtyValues: false, keepErrors: false } as const

function storedNotes(notes: string): PartyNotesValues {
    return { notes: notes ?? '' }
}

/**
 * A party page's Notes field: the one place a customer's or a vendor's notes are edited.
 * The form follows the stored notes while it is clean, and keeps what the user typed when
 * the record changes underneath. `save` writes the notes to the party's collection and
 * marks the field clean; a refusal lands on the field, or on the form root when it names
 * no field, and `save` answers 'refused'. A reader's form never saves and is never dirty.
 */
export function usePartyNotesForm({ party, id }: PartyRef, notes: string, readOnly: boolean) {
    const [customersCollection, vendorsCollection] = useStore('books_customers', 'books_vendors')
    const collectionName = party === 'customer' ? 'books_customers' : 'books_vendors'
    const values = storedNotes(notes)
    const form = useForm<PartyNotesValues>({
        resolver: zodResolver(partyNotesSchema),
        defaultValues: values,
        values,
        resetOptions: { keepDirtyValues: true, keepErrors: true, keepIsSubmitted: true },
    })
    // Read through the form state proxy, so a change re-renders the page. Not `isDirty`:
    // the `values` reset keeps the typed text (keepDirtyValues) but turns `isDirty` false
    // after an optimistic write and its rollback, while the field stays dirty.
    const isDirty = !readOnly && form.formState.dirtyFields.notes === true

    const update = useMutation({
        mutationFn: function* (saved: PartyNotesValues) {
            const write = (draft: { notes: string }) => {
                draft.notes = saved.notes
            }
            yield party === 'customer'
                ? customersCollection.update(id, write)
                : vendorsCollection.update(id, write)
        },
        onError: recordRefusalHandler(
            form,
            handleMutationErrorsWithForm({
                setError: form.setError,
                getValues: form.getValues,
                operation: `books.${party === 'customer' ? 'customers' : 'vendors'}.notes`,
                collection: collectionName,
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

    const reset = () => form.reset(storedNotes(notes), { ...DROP_EDITS, keepIsSubmitted: false })

    return { form, isDirty, isSaving: update.isPending, save, reset }
}
