import { LoadingState } from '@tinycld/core/components/LoadingState'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { router, useIsFocused } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { useBackToEntries } from '../../hooks/useBackToEntries'
import { useDeleteDraft } from '../../hooks/useDeleteDraft'
import { type ReadyEntryDetail, useEntryDetail } from '../../hooks/useEntryDetail'
import type { SaveOutcome } from '../../hooks/useEntrySubmit'
import type { LineTotals } from '../../lib/entry-lines'
import { DeleteDraftDialog } from './DeleteDraftDialog'
import { EntryForm } from './EntryForm'
import { EntryHeader, EntryHeaderMenu } from './EntryHeader'
import { EntryLoadError } from './EntryLoadError'
import { EntryNotice } from './EntryNotice'
import { EntryReadOnlyView } from './EntryReadOnlyView'
import { EntryStatusBadge } from './EntryStatusBadge'
import { ReplaceHeader } from './ReplaceHeader'

// What a draft screen is built from; it is taken once, from the first editable model.
interface HeldDraft {
    entryId: string
    currency: string
    // The draft's revision when the values below were taken: what a save states it saw.
    revision: number
    initialValues: ReadyEntryDetail['initialValues']
    // Set on a saved replacement draft: the number of the posted entry it replaces.
    replacesNumber?: string
}

interface DraftScreenProps {
    held: HeldDraft
    // Set once the status left `draft` (a post not yet confirmed, or one from another
    // session): the read-only view then shows over the hidden form.
    flipped: ReadyEntryDetail | null
    onSaveBusyChange(isBusy: boolean): void
    onDeleteBusyChange(isBusy: boolean): void
    // Takes the draft from the store again, after another session changed it.
    onReload(): void
}

// While a save or delete runs, this screen stays mounted whatever the optimistic rows say,
// so the typed values, a refusal message and the delete dialog survive a rollback. The
// form is seeded once: later changes from other sessions never reach `saved`, so a Save
// cannot delete a line the form never showed.
function DraftScreen({
    held,
    flipped,
    onSaveBusyChange,
    onDeleteBusyChange,
    onReload,
}: DraftScreenProps) {
    const { entryId, currency, revision, initialValues, replacesNumber } = held
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
    const header = (totals: LineTotals) => {
        if (flipped) return null
        const menu = <EntryHeaderMenu isVisible onDeleteDraft={del.open} />
        if (replacesNumber) {
            return (
                <ReplaceHeader
                    originalNumber={replacesNumber}
                    totals={totals}
                    currency={currency}
                    menu={menu}
                />
            )
        }
        return (
            <EntryHeader
                title="Journal entry"
                badge={<EntryStatusBadge status="draft" />}
                bigTotal={totals.bigTotal}
                isTooLarge={totals.isTooLarge}
                currency={currency}
                menu={menu}
            />
        )
    }
    return (
        <>
            <View className="flex-1" style={flipped ? { display: 'none' } : undefined}>
                <EntryForm
                    initial={initialValues}
                    saved={initialValues.lines}
                    entryId={entryId}
                    revision={revision}
                    onReload={onReload}
                    currency={currency}
                    journalNumber={replacesNumber}
                    onSaved={onSaved}
                    onCancel={onBack}
                    onBusyChange={onSaveBusyChange}
                    onDeleteDraft={del.open}
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
    // A reload drops the held draft, so the next render takes the stored one, and the
    // new key mounts a new form on it: the old form's typed values go with it.
    const [reloads, setReloads] = useState(0)
    const [entriesCollection, linesCollection] = useStore(
        'books_journal_entries',
        'books_journal_lines'
    )
    // The store can be behind the server (a realtime message that did not arrive), and a
    // form built from it would be refused again, so the rows are read again first. A
    // failed read still loads what the store holds.
    const reload = async () => {
        try {
            await Promise.all([entriesCollection.reload(), linesCollection.reload()])
        } catch (error) {
            log.error('books.entry', error)
        }
        setHeld(null)
        setReloads(count => count + 1)
    }
    if (!held && detail.viewState === 'ready' && detail.isEditable) {
        setHeld({
            entryId: detail.entry.id,
            currency: detail.currency,
            revision: detail.entry.revision,
            initialValues: detail.initialValues,
            replacesNumber: detail.replacesEntry?.number,
        })
    }
    const isReady = detail.viewState === 'ready'
    const isDraftRow = isReady && detail.entry.status === 'draft'
    // A failed reload is held like a loading one: the form already has its rows, and an
    // error screen in its place would drop what the user typed.
    const isLoadingHere =
        (detail.viewState === 'loading' || detail.viewState === 'error') && isFocused
    const showsDraft =
        held !== null && (isBusy || isLoadingHere || (isReady && (detail.isEditable || isDraftRow)))
    if (held && showsDraft) {
        return (
            <DraftScreen
                key={`${held.entryId}:${reloads}`}
                held={held}
                onReload={reload}
                flipped={isReady && !isDraftRow ? detail : null}
                onSaveBusyChange={setSaving}
                onDeleteBusyChange={setDeleting}
            />
        )
    }
    // The form is gone, and what it was built from is older than its own saves: the next
    // form takes the stored draft and its revision.
    if (held) setHeld(null)
    if (detail.viewState === 'loading') return <LoadingState />
    if (detail.viewState === 'error') return <EntryLoadError onRetry={detail.retry} />
    if (detail.viewState === 'not-found') {
        return <EntryNotice testID="entry-not-found" message="This entry does not exist" />
    }
    return <EntryReadOnlyView detail={detail} />
}
