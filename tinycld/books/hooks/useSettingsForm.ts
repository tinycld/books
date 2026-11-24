import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { type FieldValues, type Path, useForm, type z, zodResolver } from '@tinycld/core/ui/form'
import { useRef } from 'react'
import { messageOnlyRefusal } from '../lib/refusal'
import type { BooksSettings } from '../types'

type Options<V extends FieldValues> = {
    schema: z.ZodType<V, V>
    values: V
    toPatch: (values: V) => Partial<BooksSettings>
}

// A save: the parsed form and the fields the person changed in it.
type Attempt<V> = { parsed: V; changed: string[] }

// The row's values with the person's changes on top. Another writer can save the row while
// the form is open; taking every other field from the row means a save never writes back an
// old value of a field this form did not change.
function withOwnChanges<V extends FieldValues>(row: V, { parsed, changed }: Attempt<V>): V {
    const own = Object.fromEntries(changed.map(key => [key, parsed[key]]))
    return { ...row, ...own }
}

export function useSettingsForm<V extends FieldValues>({ schema, values, toPatch }: Options<V>) {
    const [settingsCollection] = useStore('books_settings')
    const addToast = useToastStore(s => s.addToast)
    const form = useForm<V>({
        resolver: zodResolver(schema),
        values,
        resetOptions: { keepDirtyValues: true, keepErrors: true, keepIsSubmitted: true },
    })
    const { setError, getValues, reset, setValue } = form
    // The live row as of the last render. The mutation callbacks read it when they run, so
    // a save that settles after another writer's update sees that update.
    const row = useRef(values)
    row.current = values

    const inFlight = useRef(false)

    const mutation = useMutation({
        mutationFn: function* (attempt: Attempt<V>) {
            // The row the drawn form's screen holds in the store. A read of its own here would be
            // one more query that a settings Retry has to rebuild before Save works again.
            const [settings] = settingsCollection.toArray
            if (!settings) throw new Error('The Books settings could not be found')
            const next = toPatch(withOwnChanges(row.current, attempt))
            yield settingsCollection.update(settings.id, draft => {
                Object.assign(draft, next)
            })
        },
        onSettled: () => {
            inFlight.current = false
        },
        onSuccess: (_result, attempt) => {
            inFlight.current = false
            addToast({ title: 'Saved.', variant: 'success', duration: 3000 })
            // The inputs stay editable during a save: keep what was typed after Save was pressed.
            reset(withOwnChanges(row.current, attempt), {
                keepDirtyValues: true,
                keepIsSubmitted: false,
                keepErrors: false,
            })
        },
        onError: (error: unknown, { parsed, changed }: Attempt<V>) => {
            inFlight.current = false
            // The optimistic write moved the form defaults, so the rollback leaves the typed values clean; mark them dirty again
            for (const key of changed) {
                setValue(key as Path<V>, parsed[key], { shouldDirty: true })
            }
            const message = messageOnlyRefusal(error)
            if (message) setError('root', { type: 'server', message })
            else handleMutationErrorsWithForm({ setError, getValues })(error)
        },
    })

    const submit = form.handleSubmit(parsed => {
        if (inFlight.current) return
        inFlight.current = true
        // Read at submit, not from a render: a field set in the same tick is in it.
        mutation.mutate({ parsed, changed: Object.keys(form.formState.dirtyFields) })
    })

    return {
        form,
        submit: () => void submit(),
        isPending: mutation.isPending,
        isDirty: form.formState.isDirty,
    }
}
