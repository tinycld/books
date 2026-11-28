import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useForm, zodResolver } from '@tinycld/core/ui/form'
import { newRecordId } from 'pbtsdb/core'
import { type BinDialogTarget, binDialogState } from '../lib/bin-list'
import { type BinValues, binSchema } from '../lib/bin-schema'
import { useBinDialogStore } from '../stores/bin-dialog-store'

type StoredBin = { id: string; name: string; note: string; inactive: boolean }

const NEW_VALUES: BinValues = { name: '', note: '' }

function valuesOf(stored: StoredBin | undefined): BinValues {
    if (!stored) return NEW_VALUES
    return { name: stored.name, note: stored.note, inactive: stored.inactive }
}

/**
 * The bin the dialog edits, by its own live query (core useRecord has no error state), and
 * `state` (binDialogState): the form, the bin loading, its load error, or `gone` when the
 * bin was deleted elsewhere. The bin list reads it, so it derives its notice of a gone bin
 * during render, and hands it to the dialog it draws.
 */
export function useEditedBin(target: BinDialogTarget | null) {
    const [binsCollection] = useStore('books_bins')
    const editId = target?.mode === 'edit' ? target.id : ''
    const storedQuery = useLiveQuery({
        query: q =>
            editId
                ? q
                      .from({ bin: binsCollection })
                      .where(({ bin }) => eq(bin.id, editId))
                      .select(({ bin }) => ({
                          id: bin.id,
                          name: bin.name,
                          note: bin.note,
                          inactive: bin.inactive,
                      }))
                      .findOne()
                : null,
        queryKey: ['books.bins.dialog', editId],
    })
    const stored = storedQuery.data
    const state = binDialogState({
        mode: target?.mode ?? 'new',
        isLoading: !storedQuery.isReady,
        isError: storedQuery.isError,
        record: stored,
    })
    const retryLoad = () => {
        void recoverLiveQueries({
            queries: [storedQuery.collection],
            sources: [binsCollection],
            onError: err => log.error('books.bins.dialog', err),
        })
    }
    return { stored, state, retryLoad }
}

export type EditedBin = ReturnType<typeof useEditedBin>

/**
 * The bin dialog (inventory-adjust spec §3.7): the form over `binSchema` for the edited bin
 * (useEditedBin, read by the list) and the one insert or update. `state` is what BinDialog
 * draws: the form, the bin loading, or its load error with Retry and no Save; the list
 * draws no dialog for a gone bin and shows its notice instead. A server refusal of the
 * name lands on Name (handleMutationErrorsWithForm); one with no field shows in the form's
 * summary.
 */
export function useBinDialog(target: BinDialogTarget, edited: EditedBin) {
    const [binsCollection] = useStore('books_bins')
    const { stored, state, retryLoad } = edited
    const close = useBinDialogStore(s => s.close)

    // The edited bin can load after the dialog opens: the form takes its values when they
    // arrive and keeps what the user already typed.
    const values = valuesOf(stored)
    const form = useForm<BinValues>({
        resolver: zodResolver(binSchema),
        defaultValues: values,
        values,
        resetOptions: { keepDirtyValues: true, keepErrors: true, keepIsSubmitted: true },
    })

    const save = useMutation({
        mutationFn: function* (saved: BinValues) {
            if (!stored) {
                yield binsCollection.insert({
                    id: newRecordId(),
                    name: saved.name,
                    note: saved.note,
                    inactive: false,
                })
                return
            }
            yield binsCollection.update(stored.id, draft => {
                draft.name = saved.name
                draft.note = saved.note
                draft.inactive = saved.inactive ?? stored.inactive
            })
        },
        onSuccess: () => close(),
        onError: handleMutationErrorsWithForm({
            setError: form.setError,
            getValues: form.getValues,
            rootMessage: true,
        }),
    })

    const isEdit = target.mode === 'edit'
    const canSave = state === 'form' && !save.isPending
    const submit = () => {
        if (!canSave) return
        void form.handleSubmit(saved => save.mutate(saved))()
    }

    return {
        state,
        form,
        isEdit,
        title: isEdit ? 'Edit bin location' : 'New bin location',
        submit,
        canSave,
        isSaving: save.isPending,
        summaryEnabled: form.formState.isSubmitted,
        retryLoad,
        close,
    }
}

export type BinDialogModel = ReturnType<typeof useBinDialog>
