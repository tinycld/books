import { errorToString } from '@tinycld/core/lib/errors'
import { useRef, useState } from 'react'
import { useEntryActions } from './useEntryActions'

// Delete is the only draft action here; the dialog is local UI no other component needs.
// A success keeps `onBusyChange(true)` until the screen is gone, so the entry the delete
// removes is never reported missing on the way out.
export function useDeleteDraft(entryId: string, onBusyChange: (isBusy: boolean) => void) {
    const { deleteDraft, isPending } = useEntryActions(entryId)
    const [isOpen, setOpen] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const isRunning = useRef(false)
    const open = () => {
        setErrorMessage(null)
        setOpen(true)
    }
    const confirm = async () => {
        if (isRunning.current) return
        isRunning.current = true
        setErrorMessage(null)
        onBusyChange(true)
        try {
            await deleteDraft()
        } catch (error) {
            setErrorMessage(errorToString(error))
            isRunning.current = false
            onBusyChange(false)
        }
    }
    return { isOpen, isPending, errorMessage, open, confirm, cancel: () => setOpen(false) }
}
