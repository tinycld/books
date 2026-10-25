import { useFieldArray, useForm, useWatch } from '@tinycld/core/ui/form'
import { useRef } from 'react'
import { sumLines } from '../lib/entry-lines'
import { type EntryFormValues, emptyLine, entryResolver } from '../lib/entry-schema'
import { createFocusRegistry, type LineColumn, nextCell } from '../lib/line-focus'
import { staleErrorClearers } from './useClearStaleErrors'

export function useEntryForm({
    initial,
    currency,
}: {
    initial: EntryFormValues
    currency?: string
}) {
    const modeRef = useRef<'draft' | 'post'>('draft')
    const form = useForm<EntryFormValues>({
        resolver: entryResolver(() => modeRef.current, currency),
        defaultValues: initial,
    })
    const { control } = form
    // keyName 'key' keeps RHF's generated row key off the saved line `id`.
    const { fields, append, remove, swap } = useFieldArray({
        control,
        name: 'lines',
        keyName: 'key',
    })
    const focusRef = useRef<ReturnType<typeof createFocusRegistry>>(null)
    focusRef.current ??= createFocusRegistry()
    const focus = focusRef.current
    const totals = sumLines(useWatch({ control, name: 'lines' }), currency)

    const { onAmountEdit } = staleErrorClearers(form)
    // Adding, removing or moving a line changes what an error was about.
    const move = (index: number, direction: -1 | 1) => {
        swap(index, index + direction)
        onAmountEdit()
    }

    const submit = (index: number, column: LineColumn) => {
        const next = nextCell(index, column)
        if (next.index >= fields.length) append(emptyLine())
        focus.focus(next.index, next.column)
    }

    return {
        form,
        register: focus.register,
        focus: focus.focus,
        submit,
        fields,
        totals,
        modeRef,
        addLine: () => {
            append(emptyLine())
            onAmountEdit()
        },
        removeLine: (index: number) => {
            remove(index)
            onAmountEdit()
        },
        moveLineUp: (index: number) => move(index, -1),
        moveLineDown: (index: number) => move(index, 1),
        isDirty: form.formState.isDirty,
    }
}
