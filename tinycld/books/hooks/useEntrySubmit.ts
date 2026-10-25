import { extractValidationErrors } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useEffect, useRef, useState } from 'react'
import { isBlankLine } from '../lib/entry-lines'
import { parseLineRefusal } from '../lib/entry-messages'
import type { EntryFormValues } from '../lib/entry-schema'
import type { useEntryForm } from './useEntryForm'
import { useEntrySave } from './useEntrySave'

export type SaveOutcome = 'draft' | 'post' | 'post-new'

interface EntrySubmitProps {
    entryForm: ReturnType<typeof useEntryForm>
    currency: string
    onSaved(id: string, outcome: SaveOutcome): void
    onCancel(): void
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

export function useEntrySubmit({ entryForm, currency, onSaved, onCancel }: EntrySubmitProps) {
    const { form, modeRef, isDirty } = entryForm
    const { setError, handleSubmit, reset } = form
    const { saveDraft, post, isPending } = useEntrySave({
        entryId: null,
        saved: [],
        currency,
        onDraftSaved: values =>
            reset(values, { keepValues: true, keepErrors: true, keepIsSubmitted: true }),
    })
    const [isDiscardOpen, setDiscardOpen] = useState(false)
    const isBusy = useRef(false)
    const isLive = useRef(true)
    const left = useRef(false)
    // `isLive` only ends with the screen; `left` ends the pull back to a screen the user
    // left, and a later edit or submit starts over.
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
        left.current = false
        modeRef.current = mode
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
        }
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
        cancel: () => (isDirty ? setDiscardOpen(true) : leave()),
        keepEditing: () => setDiscardOpen(false),
        discard: () => {
            setDiscardOpen(false)
            leave()
        },
    }
}
