import { useLeaveGuard } from '@tinycld/core/components/forms-builder/use-leave-guard'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { type RecordChildState, usePublishDirty } from '../components/RecordChild'
import type { PartyTab } from '../lib/party-page-tabs'
import { partyTabOf } from '../lib/party-page-tabs'
import type { DocumentPartyKey } from '../lib/sales-document-kinds'
import { type RecordFormStore, useDeletingRecord } from '../stores/record-form-store'
import { useBooksAccess } from './useBooksAccess'
import { usePartyNotesForm } from './usePartyNotesForm'
import { useIsShowingRecord } from './useRecordNavigation'
import type { RecordSaveFollowUps } from './useRecordSave'

// Whether a form holds an error on a field (not only on its root).
function hasFieldErrors(errors: object) {
    return Object.keys(errors).some(key => key !== 'root')
}

// The page stays after its Details save, in place of the default leave.
function stayOnPage() {}

export type PartyPageFollowUps = Pick<RecordSaveFollowUps, 'afterEdit' | 'afterWrite' | 'onRefused'>

// What the page needs of the party's list actions (`useRecordActions`).
type PartyPageActions = {
    actionError: { id: string; message: string } | null
    clearActionError: (id?: string) => void
    setInactive: (id: string, inactive: boolean) => unknown
}

type PartyPageControls = { showNewTransaction: boolean; newTransactionDisabled: boolean }

export type PartyPageInput<
    Record extends { id: string; notes: string; inactive: boolean },
    Controls extends PartyPageControls,
    StoreRecord extends { id: string },
    Navigation extends { leave: () => void },
    Actions extends PartyPageActions,
> = {
    party: DocumentPartyKey
    record: Record
    // The party's list route, for `useIsShowingRecord`.
    listPath: string
    tabOrder: readonly PartyTab[]
    // One function for the page's life, so the tab strip's keys stay registered.
    selectTab: (key: PartyTab) => void
    // The party's Details form (an edit form of `record`), called once per render.
    useDetails: (record: Record, followUps: PartyPageFollowUps) => RecordChildState
    store: RecordFormStore<StoreRecord>
    navigation: Navigation
    actions: Actions
    controlsFor: (access: { canRead: boolean; canWrite: boolean }) => Controls
}

/**
 * A party page's state: the selected tab (the `tab` search param), and the Details and
 * Notes forms, which live here, above the tabs, so a tab switch keeps their edits. Save
 * writes Details first (the patch path), then the notes, and stays on the page; a refusal
 * on a field selects the tab that holds it. The leave guard holds every way out while
 * either form has edits, except while a save runs or the record is being deleted. What
 * names the party (its Details form, store, navigation, actions and controls) is input.
 */
export function usePartyPage<
    Record extends { id: string; notes: string; inactive: boolean },
    Controls extends PartyPageControls,
    StoreRecord extends { id: string },
    Navigation extends { leave: () => void },
    Actions extends PartyPageActions,
>(input: PartyPageInput<Record, Controls, StoreRecord, Navigation, Actions>) {
    const { party, record, selectTab, navigation, actions } = input
    const params = useLocalSearchParams<{ tab?: string }>()
    const tab = partyTabOf(input.tabOrder, params.tab)
    const isShowing = useIsShowingRecord(input.listPath)
    const { canRead } = useBooksAccess()

    const details = input.useDetails(record, {
        afterEdit: stayOnPage,
        // Details written (or nothing to write): the notes follow, also when the user
        // left the page while the Details write ran.
        afterWrite: () => void saveNotes(),
        onRefused: fieldKeys => {
            if (fieldKeys.length > 0) selectTab('details')
        },
    })
    const { readOnly, canWrite } = details
    const notes = usePartyNotesForm({ party, id: record.id }, record.notes, readOnly)

    // The write runs whether or not the page is still open; only the tab follows the
    // refusal, and only while the user still sees this record.
    const saveNotes = async () => {
        const result = await notes.save()
        if (result !== 'refused' || !isShowing(record.id)) return
        if (hasFieldErrors(notes.form.formState.errors)) selectTab('notes')
    }

    const isDirty = details.isDirty || notes.isDirty
    const isSaving = details.isSaving || notes.isSaving

    // Details first: its write's answer (`afterWrite`) saves the notes. A Details field
    // the form refuses before the write (a client rule) selects the Details tab.
    const save = async () => {
        // A new answer replaces the last one: the notes' old refusal must not stay in the
        // bar while the Details write runs.
        notes.form.clearErrors('root')
        if (!details.isDirty) {
            await saveNotes()
            return
        }
        await details.save()
        if (hasFieldErrors(details.form.formState.errors)) selectTab('details')
    }

    // Cancel asks the same question as the leave guard; Discard puts both forms back to
    // the stored values.
    const [isCancelling, setCancelling] = useState(false)
    const discard = () => {
        // The edit form follows the record with `keepDirtyValues`, which react-hook-form
        // also lays under this call; off here, the stored values replace the typed ones.
        details.form.reset(undefined, { keepDirtyValues: false })
        notes.reset()
        setCancelling(false)
    }
    const cancelQuestion = {
        isConfirming: isCancelling,
        cancel: () => setCancelling(false),
        discard,
    }
    const cancel = () => setCancelling(true)

    const isBeingDeleted = useDeletingRecord(input.store, record.id) !== undefined
    const guard = useLeaveGuard(isDirty && !isSaving && !isBeingDeleted)
    usePublishDirty(input.store, details.form, record.id, readOnly, notes.isDirty)

    // The More menu's Delete dialog. While it is open it shows this record's refusal, so
    // the page's banner does not show it a second time.
    const [isDeleteOpen, setDeleteOpen] = useState(false)
    const openDelete = () => {
        actions.clearActionError(record.id)
        setDeleteOpen(true)
    }
    const closeDelete = () => {
        actions.clearActionError(record.id)
        setDeleteOpen(false)
    }
    // The delete's answer may land after the user went on (the Lists hub, another
    // package): it leaves to the list only while they still see this record.
    const onDeleted = () => {
        if (!isShowing(record.id)) return false
        navigation.leave()
        return true
    }
    // What the header, the More menu and the Transactions tab offer. The New transaction
    // menu is one state for the header's button and the Transactions tab's empty-state
    // button; it is never open while the menu is disabled or hidden.
    const controls = input.controlsFor({ canRead, canWrite })
    const isNewMenuOffered = controls.showNewTransaction && !controls.newTransactionDisabled
    const [newMenuState, setNewMenuState] = useState(false)
    // The record turned inactive (here or in another session) while the menu was open:
    // the stored state is cleared during render, so the menu does not open by itself when
    // the record is active again.
    if (newMenuState && !isNewMenuOffered) setNewMenuState(false)
    const newMenuOpen = newMenuState && isNewMenuOffered
    const setNewMenuOpen = (open: boolean) => setNewMenuState(open && isNewMenuOffered)
    const toggleInactive = () => {
        setNewMenuOpen(false)
        void actions.setInactive(record.id, !record.inactive)
    }

    const actionRefusal = actions.actionError?.message ?? null
    const bannerMessage = isDeleteOpen ? null : actionRefusal
    const deleteRefusal = actions.actionError?.id === record.id ? actionRefusal : null

    // On the Details tab the form's own summary shows its root refusal; elsewhere the
    // save bar shows it, then the notes' root refusal.
    const detailsRoot = tab === 'details' ? undefined : details.form.formState.errors.root?.message
    const rootError = detailsRoot ?? notes.form.formState.errors.root?.message ?? null

    return {
        tab,
        selectTab,
        details,
        notes,
        isDirty,
        isSaving,
        save,
        cancel,
        cancelQuestion,
        discard,
        guard,
        rootError,
        readOnly,
        canWrite,
        navigation,
        actions,
        deleteDialog: {
            isOpen: isDeleteOpen,
            open: openDelete,
            close: closeDelete,
            onDeleted,
            refusal: deleteRefusal,
        },
        bannerMessage,
        controls,
        newMenuOpen,
        setNewMenuOpen,
        toggleInactive,
    }
}

// A party page's state as the shared parts read it; a party's own page state (for
// example `CustomerPageState`) carries its own navigation, actions and controls types.
export type PartyPageState = ReturnType<typeof usePartyPage>
