import { extractValidationErrors } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useEffect, useRef, useState } from 'react'
import { writeRefusalText } from '../lib/refusal'
import {
    EMPTY_LINE_IDS,
    type TransferFormValues,
    type TransferLineIds,
    transferEntryValues,
    transferLines,
    transferRefusalField,
} from '../lib/transfer'
import { useTransferPostStore } from '../stores/transfer-post-store'
import { useEntrySave } from './useEntrySave'
import type { SaveOutcome } from './useEntrySubmit'
import type { useTransferForm } from './useTransferForm'

interface TransferSubmitProps {
    transferForm: ReturnType<typeof useTransferForm>
    currency: string
    // A saved draft and the ids of its two lines; a new transfer has neither.
    entryId?: string | null
    savedIds?: TransferLineIds
    // The revision of the draft the form's values were taken from; 0 for a new transfer.
    revision?: number
    // The posted transfer a new draft replaces.
    replaces?: string
    onSaved(id: string, outcome: SaveOutcome): void
    onCancel(): void
}

// The typed content of the form, to tell edits made after a submit from the ones it writes.
function editSnapshot(values: TransferFormValues) {
    const { from, to, amount, date, memo } = values
    return JSON.stringify([from, to, amount, date, memo])
}

export function useTransferSubmit({
    transferForm,
    currency,
    entryId = null,
    savedIds,
    revision = 0,
    replaces,
    onSaved,
    onCancel,
}: TransferSubmitProps) {
    const { form, isDirty } = transferForm
    const { setError, handleSubmit, reset, getValues } = form
    // The ids of the two lines this form has written. A refused post leaves a complete
    // draft behind, so the next save must update those rows instead of inserting new ones.
    // A new form (and a correction of a posted transfer) starts with none.
    const idsRef = useRef<TransferLineIds>(savedIds ?? EMPTY_LINE_IDS)
    // What the user had typed at submit, until the save's baseline reset replaces it.
    const submittedSnapshot = useRef<string | null>(null)
    const submittedValues = useRef<TransferFormValues | null>(null)
    const { saveDraft, post, isPending } = useEntrySave({
        entryId,
        revision,
        // A saved draft's two stored lines, so a line the user did not change is not
        // written again.
        saved: savedIds ? transferLines(transferForm.initial, savedIds) : [],
        replaces,
        currency,
        docType: 'transfer',
        // Called once the entry and both lines are written, before a post sets the status:
        // the written draft becomes the form's baseline even when the post is then refused.
        onDraftSaved: values => {
            idsRef.current = { from: values.lines[0]?.id ?? '', to: values.lines[1]?.id ?? '' }
            // Text typed after the submit is not part of this save, so it stays an edit.
            reset(submittedValues.current ?? getValues(), {
                keepValues: true,
                keepErrors: true,
                keepIsSubmitted: true,
            })
            submittedSnapshot.current = null
        },
    })
    const [isDiscardOpen, setDiscardOpen] = useState(false)
    const isBusy = useRef(false)
    const isLive = useRef(true)
    const left = useRef(false)
    // `isLive` ends with any unmount: the form stays mounted while a post is unconfirmed, so
    // an unmount is the user leaving or the confirmed flip, and neither may navigate on.
    // `left` ends the pull back to a screen the user left; a later submit starts over.
    useEffect(() => {
        isLive.current = true
        return () => {
            isLive.current = false
        }
    }, [])

    const showRefusal = (error: unknown) => {
        const fieldErrors = Object.entries(extractValidationErrors(error) ?? {})
        if (fieldErrors.length > 0) {
            // A key that is no field of this form has nowhere to sit, so its message joins
            // the summary. Only those messages go there: the refusal text of a response
            // with field data repeats every field message, so a placed one would show twice.
            const unplaced: string[] = []
            for (const [key, message] of fieldErrors) {
                if (key === 'date' || key === 'memo') setError(key, { type: 'server', message })
                else unplaced.push(message)
            }
            if (unplaced.length > 0) {
                setError('root', { type: 'server', message: unplaced.join(' ') })
            }
            return
        }
        // A refused line sits under its account field, without the "Line n:" prefix.
        const { field, text } = transferRefusalField(writeRefusalText(error))
        if (field) {
            setError(`root.${field}`, { type: 'server', message: text })
            return
        }
        setError('root', { type: 'server', message: text })
    }

    const submit = (mode: 'draft' | 'post', outcome: SaveOutcome) => async () => {
        if (isBusy.current) return
        isBusy.current = true
        left.current = false
        submittedSnapshot.current = editSnapshot(getValues())
        // Set before the mutation: the optimistic `posted` status reaches the screen before
        // the server answers, and the screen must keep this form up to show a refusal.
        if (mode === 'post') useTransferPostStore.getState().setPostPending(true)
        try {
            await handleSubmit(async values => {
                submittedValues.current = values
                try {
                    const save = mode === 'post' ? post : saveDraft
                    const id = await save(transferEntryValues(values, idsRef.current))
                    if (isLive.current && !left.current) onSaved(id, outcome)
                } catch (error) {
                    if (isLive.current && !left.current) showRefusal(error)
                    else log.warn('books.transfer', writeRefusalText(error))
                }
            })()
        } finally {
            isBusy.current = false
            submittedSnapshot.current = null
            submittedValues.current = null
            if (mode === 'post') useTransferPostStore.getState().setPostPending(false)
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
