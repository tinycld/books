import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { type FieldValues, type Path, useForm, type z, zodResolver } from '@tinycld/core/ui/form'
import { useRef } from 'react'
import { messageOnlyRefusal } from '../lib/refusal'
import type { BooksSettings } from '../types'
import { useBooksSettings } from './useBooksSettings'

type Options<V extends FieldValues> = {
    schema: z.ZodType<V, V>
    values: V
    toPatch: (values: V) => Partial<BooksSettings>
}

export function useSettingsForm<V extends FieldValues>({ schema, values, toPatch }: Options<V>) {
    const [settingsCollection] = useStore('books_settings')
    const { settings } = useBooksSettings()
    const addToast = useToastStore(s => s.addToast)
    const form = useForm<V>({
        resolver: zodResolver(schema),
        values,
        resetOptions: { keepDirtyValues: true, keepErrors: true },
    })
    const { setError, getValues, reset, setValue } = form

    const inFlight = useRef(false)

    const mutation = useMutation({
        mutationFn: function* (parsed: V) {
            if (!settings) throw new Error('The Books settings could not be found')
            yield settingsCollection.update(settings.id, draft => {
                Object.assign(draft, toPatch(parsed))
            })
        },
        onSettled: () => {
            inFlight.current = false
        },
        onSuccess: (_result, parsed) => {
            inFlight.current = false
            addToast({ title: 'Saved.', variant: 'success', duration: 3000 })
            reset(parsed)
        },
        onError: (error: unknown, attempted: V) => {
            inFlight.current = false
            // The optimistic write moved the form defaults, so the rollback leaves the typed values clean; mark them dirty again
            for (const key of Object.keys(attempted)) {
                setValue(key as Path<V>, attempted[key], { shouldDirty: true })
            }
            const message = messageOnlyRefusal(error)
            if (message) setError('root', { type: 'server', message })
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
    }
}
