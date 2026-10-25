import { extractValidationErrors } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useEffect, useRef, useState } from 'react'
import { type EntryFormLine, isBlankLine } from '../lib/entry-lines'
import { parseLineRefusal } from '../lib/entry-messages'
import type { EntryFormValues } from '../lib/entry-schema'
import type { useEntryForm } from './useEntryForm'
import { useEntrySave } from './useEntrySave'

export type SaveOutcome = 'draft' | 'post' | 'post-new'

interface EntrySubmitProps {
    entryForm: ReturnType<typeof useEntryForm>
    currency: string
    // The draft being edited and its saved lines; a new entry has neither.
    entryId?: string | null
    saved?: readonly EntryFormLine[]
    // The posted entry a new draft replaces.
    replaces?: string
    onSaved(id: string, outcome: SaveOutcome): void
    onCancel(): void
    // Tells the screen a save is running, so it keeps this form mounted while a post's
    // optimistic status change is not yet confirmed.
    onBusyChange?(isBusy: boolean): void
}

type Refusal = { message?: unknown }

function refusalMessage(error: unknown) {
    const { message } = (error as { response?: Refusal } | null)?.response ?? {}
    if (typeof message === 'string' && message !== '') return message
    return error instanceof Error ? error.message : 'The entry could not be saved.'
}

// The server counts saved lines, and blank lines were dropped before saving, so
// "Line n" is the n-th non-blank form line.
function formIndexOfLine(lines: EntryFormValues['lines'], lineNumber: number) {
    let seen = 0
    for (const [index, line] of lines.entries()) {
        if (isBlankLine(line)) continue
        seen += 1
        if (seen === lineNumber) return index
    }
    return -1
}

// The typed content of the form, without the ids a save writes.
function editSnapshot(values: EntryFormValues) {
    const { date, memo, autoReverseOn } = values
    const lines = values.lines.map(({ account, debit, credit, memo: lineMemo }) => [
        account,
        debit,
        credit,
        lineMemo,
    ])
    return JSON.stringify({ date, memo, autoReverseOn, lines })
}

export function useEntrySubmit({
    entryForm,
    currency,
    entryId = null,
    saved = [],
    replaces,
    onSaved,
    onCancel,
    onBusyChange,
}: EntrySubmitProps) {
    const { form, modeRef, isDirty } = entryForm
    const { setError, setValue, handleSubmit, reset, getValues } = form
    // Field keys of the lines as they were at the last submit, and the keys now: a line is
    // found again by its key, since its index moves when a line is removed during the save.
    const submittedKeys = useRef<string[]>([])
    const currentKeys = useRef<string[]>([])
    // What the user had typed at submit, until the save's baseline reset replaces it.
    const submittedSnapshot = useRef<string | null>(null)
    const { saveDraft, post, isPending } = useEntrySave({
        entryId,
        saved,
        replaces,
        currency,
        // The typed values stay; the written line ids join them so the next save updates
        // those rows instead of inserting the added lines again.
        onDraftSaved: values => {
            // The ids go in first so the reset does not count them as edits. A line removed
            // since the submit has no key left, so it gets none.
            const lineCount = getValues('lines').length
            for (const [index, line] of values.lines.entries()) {
                const current = currentKeys.current.indexOf(submittedKeys.current[index])
                if (line.id && current >= 0 && current < lineCount) {
                    setValue(`lines.${current}.id`, line.id)
                }
            }
            reset(values, { keepValues: true, keepErrors: true, keepIsSubmitted: true })
            submittedSnapshot.current = null
        },
    })
    const [isDiscardOpen, setDiscardOpen] = useState(false)
    const isBusy = useRef(false)
    const isLive = useRef(true)
    const left = useRef(false)
    // `isLive` ends with any unmount: the form stays mounted while a post is unconfirmed, so
    // an unmount is the user leaving or the confirmed flip, and neither may navigate on.
    // `left` ends the pull back to a screen the user left, and a later submit starts over.
    useEffect(() => {
        currentKeys.current = entryForm.fields.map(field => field.key)
    })
    useEffect(() => {
        isLive.current = true
        return () => {
            isLive.current = false
        }
    }, [])

    const showRefusal = (error: unknown, lines: EntryFormValues['lines']) => {
        const fieldErrors = Object.entries(extractValidationErrors(error) ?? {})
        if (fieldErrors.length > 0) {
            // A key that is no field of this form (the server names columns, the form
            // camel-cases them) has nowhere to sit, so it joins the summary.
            const unplaced: string[] = []
            for (const [key, message] of fieldErrors) {
                if (key === 'date' || key === 'memo') setError(key, { type: 'server', message })
                else unplaced.push(message)
            }
            if (unplaced.length > 0) {
                setError('root.server', { type: 'server', message: unplaced.join(' ') })
            }
            return
        }
        const message = refusalMessage(error)
        const { lineNumber, text } = parseLineRefusal(message)
        const index = lineNumber === null ? -1 : formIndexOfLine(lines, lineNumber)
        if (lineNumber !== null && index >= 0) {
            setError(`root.line${index}`, {
                type: 'server',
                message: `Line ${lineNumber}: ${text}`,
            })
            return
        }
        setError('root.server', { type: 'server', message })
    }

    const submit = (mode: 'draft' | 'post', outcome: SaveOutcome) => async () => {
        if (isBusy.current) return
        isBusy.current = true
        onBusyChange?.(true)
        left.current = false
        modeRef.current = mode
        submittedKeys.current = entryForm.fields.map(field => field.key)
        submittedSnapshot.current = editSnapshot(getValues())
        try {
            await handleSubmit(async values => {
                try {
                    const id = await (mode === 'post' ? post : saveDraft)(values)
                    if (isLive.current && !left.current) onSaved(id, outcome)
                } catch (error) {
                    if (isLive.current && !left.current) showRefusal(error, values.lines)
                    else log.warn('books.entry', refusalMessage(error))
                }
            })()
        } finally {
            isBusy.current = false
            submittedSnapshot.current = null
            onBusyChange?.(false)
        }
    }

    const hasUnsavedEdits = () => {
        const submitted = submittedSnapshot.current
        if (submitted === null) return isDirty
        return editSnapshot(getValues()) !== submitted
    }

    const leave = () => {
        left.current = true
        onCancel()
    }

    return {
        isPending,
        isDiscardOpen,
        saveDraft: submit('draft', 'draft'),
        post: submit('post', 'post'),
        postAndNew: submit('post', 'post-new'),
        // The edits a save in flight is writing need no prompt, but text typed after the
        // submit is not part of it.
        cancel: () => (hasUnsavedEdits() ? setDiscardOpen(true) : leave()),
        keepEditing: () => setDiscardOpen(false),
        discard: () => {
            setDiscardOpen(false)
            leave()
        },
    }
}
