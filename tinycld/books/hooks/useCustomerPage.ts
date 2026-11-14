import { useLeaveGuard } from '@tinycld/core/components/forms-builder/use-leave-guard'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { usePublishDirty } from '../components/RecordChild'
import { selectRecordTab } from '../components/RecordTabs'
import {
    type CustomerTab,
    customerPageControls,
    customerTabOf,
    DEFAULT_CUSTOMER_TAB,
} from '../lib/customer-page-tabs'
import { CUSTOMERS_PATH } from '../lib/customer-route'
import { useCustomerFormStore } from '../stores/customer-form-store'
import { useDeletingRecord } from '../stores/record-form-store'
import type { BooksCustomers } from '../types'
import { useCustomerActions } from './useCustomerActions'
import { useCustomerForm } from './useCustomerForm'
import { useCustomerNavigation } from './useCustomerNavigation'
import { useCustomerNotesForm } from './useCustomerNotesForm'
import { useIsShowingRecord } from './useRecordNavigation'

// Whether a form holds an error on a field (not only on its root).
function hasFieldErrors(errors: object) {
    return Object.keys(errors).some(key => key !== 'root')
}

// One function for the page's life, so the tab strip's keys stay registered as they are.
function selectCustomerTab(key: CustomerTab) {
    selectRecordTab(DEFAULT_CUSTOMER_TAB, key)
}

// The page stays after its Details save, in place of the default leave.
function stayOnPage() {}

/**
 * The customer page's state: the selected tab (the `tab` search param), and the Details
 * and Notes forms, which live here, above the tabs, so a tab switch keeps their edits.
 * Save writes Details first (the patch path), then the notes, and stays on the page; a
 * refusal on a field selects the tab that holds it. The leave guard holds every way out
 * while either form has edits, except while a save runs or the customer is being deleted.
 */
export function useCustomerPage(record: BooksCustomers) {
    const params = useLocalSearchParams<{ tab?: string }>()
    const tab = customerTabOf(params.tab)
    const navigation = useCustomerNavigation()
    const actions = useCustomerActions()
    const isShowing = useIsShowingRecord(CUSTOMERS_PATH)

    const details = useCustomerForm(
        { mode: 'edit', record },
        {
            afterEdit: stayOnPage,
            // Details written (or nothing to write): the notes follow, also when the
            // user left the page while the Details write ran.
            afterWrite: () => void saveNotes(),
            onRefused: fieldKeys => {
                if (fieldKeys.length > 0) selectCustomerTab('details')
            },
        }
    )
    const { readOnly, canWrite } = details
    const notes = useCustomerNotesForm(record, readOnly)

    // The write runs whether or not the page is still open; only the tab follows the
    // refusal, and only while the user still sees this customer.
    const saveNotes = async () => {
        const result = await notes.save()
        if (result !== 'refused' || !isShowing(record.id)) return
        if (hasFieldErrors(notes.form.formState.errors)) selectCustomerTab('notes')
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
        if (hasFieldErrors(details.form.formState.errors)) selectCustomerTab('details')
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

    const isBeingDeleted = useDeletingRecord(useCustomerFormStore, record.id) !== undefined
    const guard = useLeaveGuard(isDirty && !isSaving && !isBeingDeleted)
    usePublishDirty(useCustomerFormStore, details.form, record.id, readOnly, notes.isDirty)

    // The More menu's Delete dialog. While it is open it shows this customer's refusal,
    // so the page's banner does not show it a second time.
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
    // package): it leaves to the list only while they still see this customer.
    const onDeleted = () => {
        if (!isShowing(record.id)) return false
        navigation.leave()
        return true
    }
    // The New transaction menu, one state for the header's button and the Transactions
    // tab's empty-state button. It is never open while the menu is disabled or hidden.
    const controls = customerPageControls({
        canWrite,
        inactive: record.inactive,
        isTopLevel: record.parent === '',
    })
    const isNewMenuOffered = controls.showNewTransaction && !controls.newTransactionDisabled
    const [newMenuState, setNewMenuState] = useState(false)
    // The customer turned inactive (here or in another session) while the menu was open:
    // the stored state is cleared during render, so the menu does not open by itself when
    // the customer is active again.
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
        selectTab: selectCustomerTab,
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
        newMenuOpen,
        setNewMenuOpen,
        toggleInactive,
    }
}

export type CustomerPageState = ReturnType<typeof useCustomerPage>
