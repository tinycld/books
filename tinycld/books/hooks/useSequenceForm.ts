import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { useRef } from 'react'
import { nextNumberPreview } from '../lib/doc-types'
import { messageOnlyRefusal } from '../lib/refusal'
import {
    type SequenceValues,
    sequenceSchema,
    sequenceUpdate,
    sequenceValues,
} from '../lib/settings-schema'
import type { BooksDocSequences } from '../types'

export function useSequenceForm(sequence: BooksDocSequences) {
    const [sequencesCollection] = useStore('books_doc_sequences')
    const addToast = useToastStore(s => s.addToast)
    const values = sequenceValues(sequence)
    const form = useForm<SequenceValues>({
        resolver: zodResolver(sequenceSchema),
        defaultValues: values,
        values,
        resetOptions: { keepDirtyValues: true, keepErrors: true, keepIsSubmitted: true },
    })
    const { setError, getValues, reset, control, setValue } = form
    const live = useWatch({ control })

    const inFlight = useRef(false)

    const mutation = useMutation({
        mutationFn: function* (parsed: SequenceValues) {
            yield sequencesCollection.update(sequence.id, draft => {
                Object.assign(draft, sequenceUpdate(parsed))
            })
        },
        onSettled: () => {
            inFlight.current = false
        },
        onSuccess: (_result, parsed) => {
            inFlight.current = false
            addToast({ title: 'Saved.', variant: 'success', duration: 3000 })
            reset(parsed, { keepIsSubmitted: false, keepErrors: false })
        },
        onError: (error: unknown, attempted: SequenceValues) => {
            inFlight.current = false
            // The optimistic write moved the form defaults, so the rollback leaves the typed values clean; mark them dirty again
            setValue('prefix', attempted.prefix, { shouldDirty: true })
            setValue('next_number', attempted.next_number, { shouldDirty: true })
            const message = messageOnlyRefusal(error)
            if (message) setError('next_number', { type: 'server', message })
            else handleMutationErrorsWithForm({ setError, getValues })(error)
        },
    })

    const submit = form.handleSubmit(parsed => {
        if (inFlight.current) return
        inFlight.current = true
        mutation.mutate(parsed)
    })

    return {
        form,
        submit: () => void submit(),
        isPending: mutation.isPending,
        isDirty: form.formState.isDirty,
        preview: nextNumberPreview(sequence.doc_type, live.prefix ?? '', live.next_number ?? ''),
    }
}
