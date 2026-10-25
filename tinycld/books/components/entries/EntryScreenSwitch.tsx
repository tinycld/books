import { LoadingState } from '@tinycld/core/components/LoadingState'
import { errorToString } from '@tinycld/core/lib/errors'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router, useIsFocused } from 'expo-router'
import { useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { useBackToEntries } from '../../hooks/useBackToEntries'
import { useEntryActions } from '../../hooks/useEntryActions'
import { type ReadyEntryDetail, useEntryDetail } from '../../hooks/useEntryDetail'
import type { SaveOutcome } from '../../hooks/useEntrySubmit'
import type { LineTotals } from '../../lib/entry-lines'
import { DeleteDraftDialog } from './DeleteDraftDialog'
import { EntryForm } from './EntryForm'
import { EntryBackLink, EntryHeader, EntryHeaderMenu } from './EntryHeader'
import { EntryReadOnlyView } from './EntryReadOnlyView'
import { EntryStatusBadge } from './EntryStatusBadge'

function NotFound() {
    return (
        <View testID="entry-not-found" className="flex-1 gap-2 bg-background px-4 pt-2">
            <EntryBackLink />
            <Text className="text-base text-foreground">This entry does not exist</Text>
        </View>
    )
}

// Delete is the only draft action here; the dialog is local UI no other component needs.
// A success keeps `onBusyChange(true)` until the screen is gone, so the entry the delete
// removes is never reported missing on the way out.
function useDeleteDraft(entryId: string, onBusyChange: (isBusy: boolean) => void) {
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

// What a draft screen is built from; it is taken once, from the first editable model.
interface HeldDraft {
    entryId: string
    currency: string
    initialValues: ReadyEntryDetail['initialValues']
}

interface DraftScreenProps {
    held: HeldDraft
    // Set once the status left `draft` (a post not yet confirmed, or one from another
    // session): the read-only view then shows over the hidden form.
    flipped: ReadyEntryDetail | null
    onSaveBusyChange(isBusy: boolean): void
    onDeleteBusyChange(isBusy: boolean): void
}

// While a save or delete runs, this screen stays mounted whatever the optimistic rows say,
// so the typed values, a refusal message and the delete dialog survive a rollback. The
// form is seeded once: later changes from other sessions never reach `saved`, so a Save
// cannot delete a line the form never showed.
function DraftScreen({ held, flipped, onSaveBusyChange, onDeleteBusyChange }: DraftScreenProps) {
    const { entryId, currency, initialValues } = held
    const orgHref = useOrgHref()
    const { onBack } = useBackToEntries()
    const del = useDeleteDraft(entryId, onDeleteBusyChange)
    // A save stays on this screen, a post flips it to the read-only view, and only
    // Post & new moves on.
    const onSaved = (_id: string, outcome: SaveOutcome) => {
        if (outcome === 'post-new') router.replace(orgHref('books/entries/new'))
    }
    // The hidden form keeps its state but not its header, so the read-only view's
    // header is the only one on screen.
    const header = (totals: LineTotals) =>
        flipped ? null : (
            <EntryHeader
                title="Journal entry"
                badge={<EntryStatusBadge status="draft" />}
                bigTotal={totals.bigTotal}
                isTooLarge={totals.isTooLarge}
                currency={currency}
                menu={<EntryHeaderMenu isVisible onDeleteDraft={del.open} />}
            />
        )
    return (
        <>
            <View className="flex-1" style={flipped ? { display: 'none' } : undefined}>
                <EntryForm
                    initial={initialValues}
                    saved={initialValues.lines}
                    entryId={entryId}
                    currency={currency}
                    onSaved={onSaved}
                    onCancel={onBack}
                    onBusyChange={onSaveBusyChange}
                    header={header}
                />
            </View>
            {flipped ? <EntryReadOnlyView detail={flipped} /> : null}
            <DeleteDraftDialog
                isVisible={del.isOpen}
                onConfirm={del.confirm}
                onCancel={del.cancel}
                isPending={del.isPending}
                errorMessage={del.errorMessage}
            />
        </>
    )
}

// The form is keyed by the entry id only: the header update of a save changes `updated`,
// and a remount then would drop the typed values and a refusal message.
export function EntryScreenSwitch({ entryId }: { entryId: string }) {
    const detail = useEntryDetail(entryId)
    // Separate flags: one action finishing must not clear the other's busy state.
    const [isSaving, setSaving] = useState(false)
    const [isDeleting, setDeleting] = useState(false)
    const isBusy = isSaving || isDeleting
    const isFocused = useIsFocused()
    // Taken from the first editable model. A reload of the live queries or a replaced row
    // (the server's copy of a row this device inserted) can make the model blink to
    // loading or read-only; remounting then would drop what the user typed. A draft gone
    // for good (deleted elsewhere) is shown as missing, unless this screen's own save or
    // delete is still running. A screen left under another one is not held while loading,
    // so it does not linger as a second copy.
    const [held, setHeld] = useState<HeldDraft | null>(null)
    if (!held && detail.viewState === 'ready' && detail.isEditable) {
        setHeld({
            entryId: detail.entry.id,
            currency: detail.currency,
            initialValues: detail.initialValues,
        })
    }
    const isReady = detail.viewState === 'ready'
    const isDraftRow = isReady && detail.entry.status === 'draft'
    const isLoadingHere = detail.viewState === 'loading' && isFocused
    const showsDraft =
        held !== null && (isBusy || isLoadingHere || (isReady && (detail.isEditable || isDraftRow)))
    if (held && showsDraft) {
        return (
            <DraftScreen
                key={held.entryId}
                held={held}
                flipped={isReady && !isDraftRow ? detail : null}
                onSaveBusyChange={setSaving}
                onDeleteBusyChange={setDeleting}
            />
        )
    }
    if (detail.viewState === 'loading') return <LoadingState />
    if (detail.viewState === 'not-found') return <NotFound />
    return <EntryReadOnlyView detail={detail} />
}
