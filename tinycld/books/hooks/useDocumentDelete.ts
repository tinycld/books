import { errorToString } from '@tinycld/core/lib/errors'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import type { SalesDocumentKind } from '../lib/sales-document-kinds'
import { useDocumentSaveStore } from '../stores/document-save-store'
import { useDeleteDraftDocument } from './useDeleteDraftDocument'

/**
 * Delete of a stored document (a draft, an estimate, a purchase order), from the form's bar
 * or the read view's More: the confirm dialog's state is local UI no other component needs.
 * The delete removes the row from the store at once, so the screen holds the document (and
 * this dialog) before it starts: a refusal stays in the dialog, with the user's edits
 * behind it, until the next attempt. A success leaves; the hold ends when the screen goes
 * (useScreenHoldRelease). Every kind deletes through the write the lists share.
 */
export function useDocumentDelete(
    kind: SalesDocumentKind,
    documentId: string | undefined,
    leave: () => void
) {
    const hold = useDocumentSaveStore(s => s.hold)
    const release = useDocumentSaveStore(s => s.release)
    const deleteWrite = useDeleteDraftDocument()
    const [isOpen, setOpen] = useState(false)
    const remove = useMutation({
        mutationFn: function* (id: string) {
            yield deleteWrite(kind.key, id)
        },
        onSuccess: () => {
            setOpen(false)
            leave()
        },
        onError: (_error, id) => release(id),
    })
    const errorMessage = remove.error ? errorToString(remove.error) : null
    const open = () => {
        remove.reset()
        setOpen(true)
    }
    const confirm = () => {
        if (!documentId) return
        hold(documentId)
        remove.mutate(documentId)
    }
    return {
        isOpen,
        isPending: remove.isPending,
        // The delete succeeded and its `leave()` runs: true from the same update that ends
        // `isPending`, until `open()` resets it.
        isSuccess: remove.isSuccess,
        errorMessage,
        open,
        confirm,
        cancel: () => setOpen(false),
    }
}

// The delete confirm's words: a posting kind's draft defaults, or its own title and body
// when it names them (a bill: "Delete this draft bill?"), keeping the draft dialog's action
// and ids; or a quote's or an order's own (kind.messages: "Delete estimate 1001?", its body
// and its action). The form's bar and the read view's More use the same words.
export function deleteDialogTexts(kind: SalesDocumentKind, number: string) {
    const { deleteTitle, deleteBody, deleteAction } = kind.messages
    if (kind.lifecycle === 'posting') {
        if (!deleteTitle || !deleteBody) return {}
        return { title: deleteTitle, body: deleteBody }
    }
    if (!deleteTitle || !deleteBody || !deleteAction) return {}
    return {
        title: deleteTitle.replace('%s', number),
        body: deleteBody,
        actionLabel: deleteAction,
        testIdPrefix: `${kind.testId}-delete`,
    }
}

// A hold of this document (a delete that succeeded) ends when the user leaves the screen.
export function useScreenHoldRelease(documentId: string | undefined) {
    const release = useDocumentSaveStore(s => s.release)
    useFocusEffect(
        useCallback(
            () => () => {
                if (documentId) release(documentId)
            },
            [documentId, release]
        )
    )
}
